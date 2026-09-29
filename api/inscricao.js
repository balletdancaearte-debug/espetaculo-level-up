export default async function handler(req, res) {
  // 1. Validar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido.' });
  }

  const {
    nomeAluna,
    dataNascimento,
    escola,
    turma,
    nomeResponsavel,
    cpfResponsavel,
    emailResponsavel,
    telefoneResponsavel,
    formaPagamento,
    alergia,
    condicaoMedica
  } = req.body;

  // 2. Validação básica de campos obrigatórios
  if (!nomeAluna || !nomeResponsavel || !cpfResponsavel || !emailResponsavel || !formaPagamento) {
    return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos obrigatórios.' });
  }

  // 3. Puxar diretamente as variáveis de ambiente cadastradas na Vercel
  const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
  const GRUPO_WHATSAPP_URL = process.env.WHATSAPP_GROUP_URL || 'https://chat.whatsapp.com/SEU_LINK_DO_GRUPO';

  if (!ASAAS_API_KEY) {
    return res.status(500).json({ 
      sucesso: false, 
      erro: 'A chave ASAAS_API_KEY não foi encontrada nas Variáveis de Ambiente da Vercel.' 
    });
  }

  // URL fixa de Produção do Asaas vinculada à sua chave de produção
  const ASAAS_URL = 'https://www.asaas.com/api/v3';

  const headers = {
    'Content-Type': 'application/json',
    'access_token': ASAAS_API_KEY
  };

  try {
    // Limpar carateres especiais do CPF e Telefone (com fallback seguro caso venha indefinido)
    const cpfLimpo = cpfResponsavel.replace(/\D/g, '');
    const telLimpo = telefoneResponsavel ? telefoneResponsavel.replace(/\D/g, '') : '';

    // 4. Verificar se o cliente já existe no Asaas pelo CPF
    let customerId = null;
    const searchResponse = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${cpfLimpo}`, { headers });
    const searchData = await searchResponse.json();

    if (searchData.errors) {
      return res.status(400).json({ sucesso: false, erro: searchData.errors[0].description });
    }

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // Criar novo cliente no Asaas se não for encontrado
      const createCustomerResponse = await fetch(`${ASAAS_URL}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: nomeResponsavel,
          cpfCnpj: cpfLimpo,
          email: emailResponsavel,
          mobilePhone: telLimpo,
          notificationDisabled: false
        })
      });

      const newCustomer = await createCustomerResponse.json();
      if (newCustomer.errors) {
        return res.status(400).json({ sucesso: false, erro: newCustomer.errors[0].description });
      }
      customerId = newCustomer.id;
    }

    // 5. Definir data de vencimento da fatura (3 dias a partir de hoje)
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 3);
    const dueDate = dataVencimento.toISOString().split('T')[0];

    // 6. Montar a descrição detalhada com o parágrafo e o link na mesma linha do texto
    const descricao = `Inscrição LEVEL UP 2026 - Aluna: ${nomeAluna} | Nasc: ${dataNascimento} | Escola: ${escola === 'studio' ? 'Studio' : 'Colégio'} | Turma: ${turma} | Resp: ${nomeResponsavel} | Tel Resp: ${telefoneResponsavel || telLimpo} | Alergia: ${alergia} | Saúde: ${condicaoMedica}\n\nENTRE NO GRUPO OFICIAL DE AVISO NO WHATSAPP: ${GRUPO_WHATSAPP_URL}`;

    // 7. Montar o payload da cobrança
    const bodyCobranca = {
      customer: customerId,
      billingType: 'UNDEFINED',
      dueDate: dueDate,
      description: descricao,
      externalReference: `INSCRICAO_${cpfLimpo}_${Date.now()}`
    };

    if (formaPagamento === 'parcelado_2x') {
      bodyCobranca.value = 200;
      bodyCobranca.installmentCount = 2;
      bodyCobranca.installmentValue = 100;
    } else {
      bodyCobranca.value = 200;
    }

    // 8. Criar a cobrança no Asaas em Produção
    const paymentResponse = await fetch(`${ASAAS_URL}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyCobranca)
    });

    const paymentData = await paymentResponse.json();

    if (paymentData.errors) {
      return res.status(400).json({ sucesso: false, erro: paymentData.errors[0].description });
    }

    // 9. Retornar a URL de pagamento e o Link do Grupo de WhatsApp para o cliente
    return res.status(200).json({
      sucesso: true,
      invoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl,
      grupoWhatsappUrl: GRUPO_WHATSAPP_URL
    });

  } catch (error) {
    console.error('Erro na integração com o Asaas:', error);
    return res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno ao conectar com a API do Asaas.' 
    });
  }
}
