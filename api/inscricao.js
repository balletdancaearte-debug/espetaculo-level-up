export default async function handler(req, res) {
  // 1. Validar método HTTP (somente POST é aceito)
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

  // 3. Obter configurações das variáveis de ambiente na Vercel
  const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
  const ASAAS_URL = process.env.ASAAS_ENV === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

  if (!ASAAS_API_KEY) {
    return res.status(500).json({ 
      sucesso: false, 
      erro: 'Chave de API do Asaas não configurada no servidor (ASAAS_API_KEY missing).' 
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'access_token': ASAAS_API_KEY
  };

  try {
    // 4. Verificar se o cliente já existe no Asaas pelo CPF
    let customerId = null;
    const searchResponse = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${cpfResponsavel}`, { headers });
    const searchData = await searchResponse.json();

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // Criar novo cliente no Asaas se não for encontrado
      const createCustomerResponse = await fetch(`${ASAAS_URL}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: nomeResponsavel,
          cpfCnpj: cpfResponsavel,
          email: emailResponsavel,
          mobilePhone: telefoneResponsavel,
          notificationDisabled: false
        })
      });

      const newCustomer = await createCustomerResponse.json();
      if (newCustomer.errors) {
        return res.status(400).json({ sucesso: false, erro: newCustomer.errors[0].description });
      }
      customerId = newCustomer.id;
    }

    // 5. Definir data de vencimento da 1ª parcela / cobrança (ex: 3 dias a partir de hoje)
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 3);
    const dueDate = dataVencimento.toISOString().split('T')[0];

    // 6. Montar a descrição detalhada para o histórico do Asaas
    const descricao = `Inscrição LEVEL UP 2026 - Aluna: ${nomeAluna} | Nasc: ${dataNascimento} | Escola: ${escola === 'studio' ? 'Studio' : 'Colégio'} | Turma: ${turma} | Alergia: ${alergia} | Saúde: ${condicaoMedica}`;

    // 7. Montar o payload da cobrança conforme a forma de pagamento escolhida
    const bodyCobranca = {
      customer: customerId,
      billingType: 'UNDEFINED', // Permite que o cliente escolha PIX, Cartão de Crédito ou Boleto na tela do Asaas
      dueDate: dueDate,
      description: descricao,
      externalReference: `INSCRICAO_${cpfResponsavel}_${Date.now()}`
    };

    if (formaPagamento === 'parcelado_2x') {
      bodyCobranca.value = 200;
      bodyCobranca.installmentCount = 2;
      bodyCobranca.installmentValue = 100;
    } else {
      bodyCobranca.value = 200;
    }

    // 8. Criar a cobrança no Asaas
    const paymentResponse = await fetch(`${ASAAS_URL}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyCobranca)
    });

    const paymentData = await paymentResponse.json();

    if (paymentData.errors) {
      return res.status(400).json({ sucesso: false, erro: paymentData.errors[0].description });
    }

    // 9. Retornar a URL da fatura/checkout para o front-end
    return res.status(200).json({
      sucesso: true,
      invoiceUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl
    });

  } catch (error) {
    console.error('Erro na integração com o Asaas:', error);
    return res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro de comunicação interno com o Asaas.' 
    });
  }
}
