type PlopPlopMethod = 'moncash' | 'natcash' | 'kashpaw' | 'all';

interface CreatePaymentInput {
  referenceId: string;
  amount: number;
  method: PlopPlopMethod;
}

interface CreatePaymentResponse {
  status: boolean;
  message: string;
  url?: string;
  transaction_id?: string;
}

interface VerifyPaymentResponse {
  status: boolean | string;
  message: string;
  montant?: number;
  trans_status?: 'no' | 'ok' | string;
  id_transaction?: string;
  date?: string;
  heure?: string;
  method?: string;
  id_client?: string | null;
  status_code?: number;
}

const PLOPPLOP_BASE_URL = (process.env.PLOPPLOP_BASE_URL || 'https://plopplop.solutionip.app').replace(/\/+$/, '');
const PLOPPLOP_CLIENT_ID = process.env.PLOPPLOP_CLIENT_ID || '';

function ensurePlopPlopConfig() {
  if (!PLOPPLOP_CLIENT_ID) {
    throw new Error('PLOPPLOP_CLIENT_ID is not configured');
  }
}

export async function createPlopPlopPayment(input: CreatePaymentInput) {
  ensurePlopPlopConfig();

  const response = await fetch(`${PLOPPLOP_BASE_URL}/api/paiement-marchand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: PLOPPLOP_CLIENT_ID,
      refference_id: input.referenceId,
      montant: input.amount,
      payment_method: input.method,
    }),
  });

  const payload = (await response.json()) as CreatePaymentResponse;

  if (!response.ok || !payload.status || !payload.url) {
    throw new Error(payload.message || 'Unable to create payment transaction');
  }

  return {
    paymentUrl: payload.url,
    transactionId: payload.transaction_id || null,
    raw: payload,
  };
}

export async function verifyPlopPlopPayment(referenceId: string) {
  ensurePlopPlopConfig();

  const response = await fetch(`${PLOPPLOP_BASE_URL}/api/paiement-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: PLOPPLOP_CLIENT_ID,
      refference_id: referenceId,
    }),
  });

  const payload = (await response.json()) as VerifyPaymentResponse;

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to verify payment transaction');
  }

  return payload;
}

