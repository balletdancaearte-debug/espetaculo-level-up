// api/inscricao.js - Código Completo com Opção À Vista ou Parcelado em 2x
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // Pega a chave das Variáveis de Ambiente da Vercel
  const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

  if (!ASAAS_API_KEY) {
    return res.status(500).json({ erro: 'Chave do Asaas não configurada na Vercel.' });
  }

  try {
    const dados = req.body;

    if (!dados || !dados.cpfResponsavel) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }

    const cpf = dados.cpfResponsavel.replace(/\D/g, '');
    const telefone = dados.telefoneResponsavel.replace(/\D/g, '');

    // 1. Buscar se o cliente já existe no Asaas
    let customerId = null;
    const searchRes = await fetch(`https://www.asaas.com/api/v3/customers?cpfCnpj=${cpf}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY,
        'User-Agent': 'StudioDancaEArte'
      }
    });

    const searchData = await searchRes.json();

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // 2. Criar cliente no Asaas se não existir
      const createRes = await fetch('https://www.asaas.com/api/v3/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY,
          'User-Agent': 'StudioDancaEArte'
        },
        body: JSON.stringify({
          name: dados.nomeResponsavel,
          cpfCnpj: cpf,
          email: dados.emailResponsavel,
          mobilePhone: telefone,
          notificationDisabled: false
        })
      });

      const createData = await createRes.json();

      if (createData.id) {
        customerId = createData.id;
      } else {
        return res.status(400).json({ 
          erro: createData.errors?.[0]?.description || 'Erro ao cadastrar responsável no Asaas.' 
        });
      }
    }

    // 3. Criar Link de Pagamento flexível (À vista R$ 200,00 ou em 2x)
    const valorTotal = 200.00;
    const description = `LEVEL UP 2026 | Aluna: ${dados.nomeAluna} | Turma: ${dados.turma} | Alergia: ${dados.alergia || 'Não'} | Saúde: ${dados.condicaoMedica || 'Não'}`;

    const linkRes = await fetch('https://www.asaas.com/api/v3/paymentLinks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY,
        'User-Agent': 'StudioDancaEArte'
      },
      body: JSON.stringify({
        name: `Inscrição LEVEL UP 2026 - ${dados.nomeAluna}`,
        description: description.substring(0, 500),
        value: valorTotal,
        billingType: 'UNDEFINED', // Libera Pix, Boleto e Cartão na mesma tela
        chargeType: 'DETACHED',    // Permite escolha flexível de parcelamento
        maxInstallmentCount: 2,    // Permite ao cliente escolher em 1x (à vista) ou em até 2x
        dueDateLimitDays: 10,      // Validade do link em dias
        notificationEnabled: true
      })
    });

    const linkData = await linkRes.json();

    // 4. Retornar a URL de pagamento para o frontend (instrucao.js)
    if (linkData.url) {
      return res.status(200).json({
        sucesso: true,
        invoiceUrl: linkData.url
      });
    } else {
      return res.status(400).json({ 
        erro: linkData.errors?.[0]?.description || 'Erro ao gerar link de pagamento no Asaas.' 
      });
    }

  } catch (error) {
    console.error('Erro no servidor:', error);
    return res.status(500).json({ erro: 'Erro interno no servidor Vercel.' });
  }
}
