type EmailRecipient = string | string[];

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');

interface SendEmailInput {
  to: EmailRecipient;
  subject: string;
  html: string;
  text: string;
}

interface OrderEmailLine {
  name: string;
  quantity: number;
  variantLabel?: string | null;
}

function isEmailConfigured() {
  return Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
}

function formatCurrency(amount: number) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} HTG`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmail(title: string, intro: string, body: string, ctaLabel?: string, ctaUrl?: string) {
  const actionBlock = ctaLabel && ctaUrl
    ? `
      <div style="margin-top: 32px;">
        <a href="${ctaUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#4b8440;color:#ffffff;text-decoration:none;font-weight:700;">
          ${escapeHtml(ctaLabel)}
        </a>
      </div>
    `
    : '';

  return `
    <div style="background:#f7f4ec;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e7e5df;">
        <div style="background:linear-gradient(135deg,#183222 0%,#4b8440 100%);padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;opacity:0.8;margin-bottom:10px;">AGRIKIRI</div>
          <h1 style="margin:0;font-size:30px;line-height:1.15;">${escapeHtml(title)}</h1>
          <p style="margin:12px 0 0;font-size:16px;line-height:1.7;opacity:0.92;">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:32px;">
          ${body}
          ${actionBlock}
        </div>
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  if (!isEmailConfigured()) {
    console.warn('📭 Resend non configuré. Email ignoré:', subject);
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: RESEND_REPLY_TO || undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend ${response.status}: ${errorBody}`);
  }
}

export async function safeSendEmail(input: SendEmailInput) {
  try {
    await sendEmail(input);
  } catch (error) {
    console.error('❌ Erreur envoi email Resend:', error);
  }
}

function renderOrderLines(lines: OrderEmailLine[]) {
  if (lines.length === 0) {
    return '<p style="margin:0;color:#6b7280;">Votre commande a bien été enregistrée.</p>';
  }

  const itemsHtml = lines
    .map((line) => {
      const label = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name;
      return `
        <li style="margin:0 0 10px 0;color:#374151;">
          <strong>${escapeHtml(label)}</strong> x ${line.quantity}
        </li>
      `;
    })
    .join('');

  return `<ul style="padding-left:18px;margin:18px 0;">${itemsHtml}</ul>`;
}

export async function sendOrderCreatedEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  items: OrderEmailLine[];
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Commande ${params.orderNumber} créée avec succès`;
  const intro = `Bonjour ${params.customerName}, votre commande a bien été enregistrée sur AGRIKIRI.`;
  const html = wrapEmail(
    'Commande enregistrée',
    intro,
    `
      <p style="margin:0 0 16px;color:#4b5563;line-height:1.7;">
        Référence de commande : <strong>${escapeHtml(params.orderNumber)}</strong><br />
        Montant total : <strong>${escapeHtml(formatCurrency(params.totalAmount))}</strong><br />
        Moyen de paiement : <strong>${escapeHtml(params.paymentMethod)}</strong>
      </p>
      <div style="padding:18px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:10px;">Produits</div>
        ${renderOrderLines(params.items)}
      </div>
    `,
    'Suivre ma commande',
    orderUrl
  );

  const text = [
    `Bonjour ${params.customerName},`,
    `Votre commande ${params.orderNumber} a bien été créée.`,
    `Montant total : ${formatCurrency(params.totalAmount)}`,
    `Moyen de paiement : ${params.paymentMethod}`,
    '',
    'Vous pouvez suivre votre commande ici :',
    orderUrl,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}

export async function sendOrderPaidEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  totalAmount: number;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Paiement confirmé pour ${params.orderNumber}`;
  const intro = `Bonjour ${params.customerName}, votre paiement a été confirmé avec succès.`;
  const html = wrapEmail(
    'Paiement confirmé',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Référence de commande : <strong>${escapeHtml(params.orderNumber)}</strong><br />
        Montant confirmé : <strong>${escapeHtml(formatCurrency(params.totalAmount))}</strong>
      </p>
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;color:#374151;line-height:1.7;">
        Votre commande est maintenant en préparation. Vous pourrez suivre son évolution depuis votre espace commandes.
      </div>
    `,
    'Voir mes commandes',
    orderUrl
  );
  const text = [
    `Bonjour ${params.customerName},`,
    `Le paiement de votre commande ${params.orderNumber} a été confirmé.`,
    `Montant confirmé : ${formatCurrency(params.totalAmount)}`,
    '',
    `Suivi : ${orderUrl}`,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}

export async function sendOrderStatusEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  statusLabel: string;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Mise à jour de votre commande ${params.orderNumber}`;
  const intro = `Bonjour ${params.customerName}, le statut de votre commande vient d’être mis à jour.`;
  const html = wrapEmail(
    'Mise à jour de commande',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Commande : <strong>${escapeHtml(params.orderNumber)}</strong><br />
        Nouveau statut : <strong>${escapeHtml(params.statusLabel)}</strong>
      </p>
    `,
    'Consulter la commande',
    orderUrl
  );
  const text = [
    `Bonjour ${params.customerName},`,
    `Le statut de votre commande ${params.orderNumber} est maintenant : ${params.statusLabel}.`,
    `Consultez votre suivi : ${orderUrl}`,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}

export async function sendAyizanWelcomeEmail(params: {
  to: string;
  firstName: string;
  referralCode: string;
}) {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`;
  const subject = 'Bienvenue dans le réseau AYIZAN';
  const intro = `Bonjour ${params.firstName}, vous êtes maintenant officiellement membre AYIZAN.`;
  const html = wrapEmail(
    'Bienvenue dans le réseau',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Votre code de parrainage est : <strong>${escapeHtml(params.referralCode)}</strong>
      </p>
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#fff9ed;border:1px solid #f1e2b5;color:#5f4b16;line-height:1.7;">
        Vous pouvez dès maintenant partager votre code, suivre votre activité et développer votre réseau depuis votre tableau de bord.
      </div>
    `,
    'Ouvrir mon tableau de bord',
    dashboardUrl
  );
  const text = [
    `Bonjour ${params.firstName},`,
    'Vous êtes maintenant membre AYIZAN.',
    `Votre code de parrainage : ${params.referralCode}`,
    `Accès au tableau de bord : ${dashboardUrl}`,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}
