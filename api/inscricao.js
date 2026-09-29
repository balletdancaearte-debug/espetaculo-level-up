// api/inscricao.js - Código Completo e Seguro
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

    // 3. Criar PARCELAMENTO em 2x de R$ 100,00 (Total R$ 200,00) via Pix, Boleto ou Cartão
    const totalParcelas = 2;
    const valorParcela = 100.00;

    const hoje = new Date();
    hoje.setDate(hoje.getDate() + 3); // Vencimento da 1ª parcela
    const dueDate = hoje.toISOString().split('T')[0];

    const description = `LEVEL UP 2026 | Aluna: ${dados.nomeAluna} | Turma: ${dados.turma} | Alergia: ${dados.alergia} | Saúde: ${dados.condicaoMedica}`;

    const installmentRes = await fetch('https://www.asaas.com/api/v3/installments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY,
        'User-Agent': 'StudioDancaEArte'
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED', // Aceita Pix, Boleto e Cartão em todas as parcelas
        installmentCount: totalParcelas,
        value: valorParcela,
        dueDate: dueDate,
        description: description.substring(0, 500)
      })
    });

    const installmentData = await installmentRes.json();

    // 4. Capturar a URL da fatura para exibir no site
    if (installmentData.id) {
      const paymentListRes = await fetch(`https://www.asaas.com/api/v3/payments?installment=${installmentData.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY,
          'User-Agent': 'StudioDancaEArte'
        }
      });
      const paymentListData = await paymentListRes.json();

      const invoiceUrl = paymentListData.data?.[0]?.invoiceUrl || `https://www.asaas.com/i/${installmentData.id}`;

      return res.status(200).json({
        sucesso: true,
        invoiceUrl: invoiceUrl
      });
    } else {
      return res.status(400).json({ 
        erro: installmentData.errors?.[0]?.description || 'Erro ao gerar parcelamento no Asaas.' 
      });
    }

  } catch (error) {
    console.error('Erro no servidor:', error);
    return res.status(500).json({ erro: 'Erro interno no servidor Vercel.' });
  }
}
