type EmailRecipient = string | string[];

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;

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
  unitPrice?: number;
  lineTotal?: number;
}

interface OrderEmailSummary {
  orderNumber: string;
  subtotalAmount?: number;
  deliveryFee?: number;
  totalAmount: number;
  paymentMethod?: string;
  deliveryModeLabel?: string;
  deliveryZone?: string | null;
  customerName?: string;
  detailUrl?: string;
}

interface OrderEmailAddress {
  fullName: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateRegion: string;
  postalCode?: string | null;
  countryCode: string;
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
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e7e5df;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="background:linear-gradient(135deg,#183222 0%,#4b8440 100%);padding:32px;color:#ffffff;text-align:center;">
          <img src="${LOGO_URL}" alt="AGRIKIRI" style="height:48px;margin-bottom:20px;display:inline-block;" />
          <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;">${escapeHtml(title)}</h1>
          <p style="margin:12px 0 0;font-size:16px;line-height:1.6;opacity:0.9;">${escapeHtml(intro)}</p>
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
          ${typeof line.lineTotal === 'number' ? `<span style="color:#6b7280;"> — ${escapeHtml(formatCurrency(line.lineTotal))}</span>` : ''}
        </li>
      `;
    })
    .join('');

  return `<ul style="padding-left:18px;margin:18px 0;">${itemsHtml}</ul>`;
}

function renderMoneyBreakdown(summary: OrderEmailSummary) {
  const subtotal = typeof summary.subtotalAmount === 'number' ? summary.subtotalAmount : summary.totalAmount;
  const deliveryFee = typeof summary.deliveryFee === 'number' ? summary.deliveryFee : 0;

  return `
    <div style="margin-top:20px;padding:20px;border-radius:18px;background:#f9fafb;border:1px solid #e5e7eb;">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Récapitulatif</div>
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;color:#374151;">
        <tr>
          <td style="padding:6px 0;">Sous-total</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(subtotal))}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;">Livraison</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(deliveryFee))}</td>
        </tr>
        <tr>
          <td style="padding:12px 0 0;border-top:1px solid #e5e7eb;font-size:15px;font-weight:700;color:#111827;">Total</td>
          <td style="padding:12px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-size:15px;font-weight:700;color:#183222;">
            ${escapeHtml(formatCurrency(summary.totalAmount))}
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderOrderMeta(summary: OrderEmailSummary) {
  const rows = [
    ['Référence', summary.orderNumber],
    ['Paiement', summary.paymentMethod || 'Non précisé'],
    ['Livraison', summary.deliveryModeLabel || 'Non précisée'],
    ['Zone', summary.deliveryZone || 'Non précisée'],
  ]
    .filter(([, value]) => Boolean(value))
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 0;color:#6b7280;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;">${escapeHtml(value as string)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div style="padding:18px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;">
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
        ${rows}
      </table>
    </div>
  `;
}

function renderAddressBlock(address?: OrderEmailAddress) {
  if (!address) return '';

  const lines = [
    address.fullName,
    address.phoneCountryCode && address.phoneNumber ? `${address.phoneCountryCode} ${address.phoneNumber}` : '',
    address.addressLine1,
    address.addressLine2 || '',
    `${address.city}, ${address.stateRegion}`,
    address.postalCode || '',
    address.countryCode,
  ].filter(Boolean);

  return `
    <div style="margin-top:20px;padding:18px;border-radius:18px;background:#fffdf6;border:1px solid #efe5bf;">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#8a7b38;margin-bottom:10px;">Adresse de livraison</div>
      <div style="color:#374151;line-height:1.7;">${lines.map((line) => escapeHtml(line)).join('<br />')}</div>
    </div>
  `;
}

export async function sendOrderCreatedEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  subtotalAmount?: number;
  deliveryFee?: number;
  totalAmount: number;
  paymentMethod: string;
  deliveryModeLabel?: string;
  deliveryZone?: string | null;
  items: OrderEmailLine[];
  deliveryAddress?: OrderEmailAddress;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const detailUrl = `${FRONTEND_URL}/orders`;
  const subject = `Commande ${params.orderNumber} créée avec succès`;
  const intro = `Bonjour ${params.customerName}, votre commande a bien été enregistrée sur AGRIKIRI.`;
  const html = wrapEmail(
    'Commande enregistrée',
    intro,
    `
      <p style="margin:0 0 16px;color:#4b5563;line-height:1.7;">
        Nous avons bien reçu votre commande. Vous pourrez suivre sa préparation, votre paiement et la livraison depuis votre espace commandes.
      </p>
      ${renderOrderMeta({
        orderNumber: params.orderNumber,
        subtotalAmount: params.subtotalAmount,
        deliveryFee: params.deliveryFee,
        totalAmount: params.totalAmount,
        paymentMethod: params.paymentMethod,
        deliveryModeLabel: params.deliveryModeLabel,
        deliveryZone: params.deliveryZone,
        detailUrl,
      })}
      ${renderMoneyBreakdown({
        orderNumber: params.orderNumber,
        subtotalAmount: params.subtotalAmount,
        deliveryFee: params.deliveryFee,
        totalAmount: params.totalAmount,
      })}
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:10px;">Produits</div>
        ${renderOrderLines(params.items)}
      </div>
      ${renderAddressBlock(params.deliveryAddress)}
    `,
    'Suivre ma commande',
    orderUrl
  );

  const text = [
    `Bonjour ${params.customerName},`,
    `Votre commande ${params.orderNumber} a bien été créée.`,
    `Sous-total : ${formatCurrency(params.subtotalAmount ?? params.totalAmount)}`,
    `Livraison : ${formatCurrency(params.deliveryFee ?? 0)}`,
    `Montant total : ${formatCurrency(params.totalAmount)}`,
    `Moyen de paiement : ${params.paymentMethod}`,
    params.deliveryModeLabel ? `Mode de livraison : ${params.deliveryModeLabel}` : '',
    params.deliveryZone ? `Zone : ${params.deliveryZone}` : '',
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
  subtotalAmount?: number;
  deliveryFee?: number;
  totalAmount: number;
  paymentMethod?: string;
  deliveryModeLabel?: string;
  deliveryZone?: string | null;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Paiement confirmé pour ${params.orderNumber}`;
  const intro = `Bonjour ${params.customerName}, votre paiement a été confirmé avec succès.`;
  const html = wrapEmail(
    'Paiement confirmé',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Votre paiement a été validé. Notre équipe peut maintenant préparer votre commande et organiser la livraison.
      </p>
      ${renderOrderMeta({
        orderNumber: params.orderNumber,
        subtotalAmount: params.subtotalAmount,
        deliveryFee: params.deliveryFee,
        totalAmount: params.totalAmount,
        paymentMethod: params.paymentMethod,
        deliveryModeLabel: params.deliveryModeLabel,
        deliveryZone: params.deliveryZone,
      })}
      ${renderMoneyBreakdown({
        orderNumber: params.orderNumber,
        subtotalAmount: params.subtotalAmount,
        deliveryFee: params.deliveryFee,
        totalAmount: params.totalAmount,
      })}
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;color:#374151;line-height:1.7;">
        Votre commande est maintenant en préparation. Vous retrouverez également votre facture depuis l’espace commandes.
      </div>
    `,
    'Voir mes commandes',
    orderUrl
  );
  const text = [
    `Bonjour ${params.customerName},`,
    `Le paiement de votre commande ${params.orderNumber} a été confirmé.`,
    `Sous-total : ${formatCurrency(params.subtotalAmount ?? params.totalAmount)}`,
    `Livraison : ${formatCurrency(params.deliveryFee ?? 0)}`,
    `Montant confirmé : ${formatCurrency(params.totalAmount)}`,
    params.paymentMethod ? `Moyen de paiement : ${params.paymentMethod}` : '',
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
  deliveryModeLabel?: string;
  deliveryZone?: string | null;
  trackingNumber?: string | null;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Mise à jour de votre commande ${params.orderNumber}`;
  const intro = `Bonjour ${params.customerName}, le statut de votre commande vient d’être mis à jour.`;
  const html = wrapEmail(
    'Mise à jour de commande',
    intro,
    `
      ${renderOrderMeta({
        orderNumber: params.orderNumber,
        totalAmount: 0,
        deliveryModeLabel: params.deliveryModeLabel,
        deliveryZone: params.deliveryZone,
      })}
      <div style="margin-top:20px;padding:20px;border-radius:18px;background:#f9fafb;border:1px solid #e5e7eb;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:10px;">Nouveau statut</div>
        <div style="font-size:20px;font-weight:700;color:#183222;">${escapeHtml(params.statusLabel)}</div>
        ${params.trackingNumber ? `<div style="margin-top:10px;color:#4b5563;">Référence de suivi : <strong>${escapeHtml(params.trackingNumber)}</strong></div>` : ''}
      </div>
    `,
    'Consulter la commande',
    orderUrl
  );
  const text = [
    `Bonjour ${params.customerName},`,
    `Le statut de votre commande ${params.orderNumber} est maintenant : ${params.statusLabel}.`,
    params.deliveryModeLabel ? `Mode de livraison : ${params.deliveryModeLabel}` : '',
    params.deliveryZone ? `Zone : ${params.deliveryZone}` : '',
    params.trackingNumber ? `Suivi : ${params.trackingNumber}` : '',
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

export async function sendOrderShippedEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  carrierName?: string | null;
  trackingNumber?: string | null;
  estimatedDeliveryDate?: string | null;
}) {
  const orderUrl = `${FRONTEND_URL}/orders`;
  const subject = `Votre commande ${params.orderNumber} est en route !`;
  const intro = `Bonne nouvelle ${params.customerName} ! Votre colis vient d'être remis au transporteur.`;
  
  const deliveryInfo = `
    <div style="margin-top:20px;padding:20px;border-radius:18px;background:#f0f7ff;border:1px solid #d1e9ff;color:#1e40af;line-height:1.6;">
      <h3 style="margin-top:0;font-size:16px;">Informations de livraison</h3>
      <p style="margin:5px 0;">Transporteur : <strong>${escapeHtml(params.carrierName || 'Livraison AGRIKIRI')}</strong></p>
      ${params.trackingNumber ? `<p style="margin:5px 0;">Numéro de suivi : <strong>${escapeHtml(params.trackingNumber)}</strong></p>` : ''}
      ${params.estimatedDeliveryDate ? `<p style="margin:5px 0;">Livraison estimée : <strong>${escapeHtml(params.estimatedDeliveryDate)}</strong></p>` : ''}
    </div>
  `;

  const html = wrapEmail(
    'Colis en route',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Votre commande est officiellement en cours de livraison. Vous pouvez suivre son avancement en temps réel sur votre tableau de bord.
      </p>
      ${deliveryInfo}
    `,
    'Suivre mon colis',
    orderUrl
  );

  const text = [
    `Bonjour ${params.customerName},`,
    `Votre commande ${params.orderNumber} est en route !`,
    `Transporteur : ${params.carrierName || 'Livraison AGRIKIRI'}`,
    params.trackingNumber ? `Suivi : ${params.trackingNumber}` : '',
    params.estimatedDeliveryDate ? `Date estimée : ${params.estimatedDeliveryDate}` : '',
    '',
    `Suivez votre commande ici : ${orderUrl}`,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  firstName: string;
  code: string;
}) {
  const subject = 'Votre code de réinitialisation AGRIKIRI';
  const intro = `Bonjour ${params.firstName}, voici votre code pour réinitialiser votre mot de passe.`;
  const html = wrapEmail(
    'Mot de passe oublié ?',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Utilisez le code de sécurité ci-dessous pour valider la réinitialisation de votre compte. Ce code est valable pendant 15 minutes.
      </p>
      <div style="margin:32px 0;padding:24px;background:#f9fafb;border-radius:16px;text-align:center;border:1px dashed #d1d5db;">
        <span style="font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:10px;color:#183222;">${params.code}</span>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:20px;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email. Votre mot de passe restera inchangé.
      </p>
    `,
    'Aller sur le site',
    FRONTEND_URL
  );

  const text = [
    `Bonjour ${params.firstName},`,
    `Votre code de réinitialisation est : ${params.code}`,
    '',
    'Ce code est valable 15 minutes.',
    'Si vous n\'avez pas fait cette demande, ignorez cet email.',
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}

export async function sendAdminOrderNotification(params: {
  orderNumber: string;
  totalAmount: number;
  customerName: string;
  itemsCount: number;
}) {
  const adminUrl = `${FRONTEND_URL}/admin/orders`;
  const subject = `🔔 Nouvelle commande : ${params.orderNumber}`;
  const intro = `Une nouvelle commande vient d'être passée par ${params.customerName}.`;
  
  const html = wrapEmail(
    'Nouvelle commande reçue',
    intro,
    `
      <div style="padding:20px;border-radius:18px;background:#f9fafb;border:1px solid #e5e7eb;">
        <p style="margin:5px 0;">Commande : <strong>${params.orderNumber}</strong></p>
        <p style="margin:5px 0;">Montant : <strong>${formatCurrency(params.totalAmount)}</strong></p>
        <p style="margin:5px 0;">Nombre d'articles : <strong>${params.itemsCount}</strong></p>
      </div>
      <p style="margin-top:20px;color:#4b5563;">
        Veuillez vous connecter à l'interface d'administration pour traiter cette commande.
      </p>
    `,
    'Gérer la commande',
    adminUrl
  );

  const text = [
    `Nouvelle commande reçue : ${params.orderNumber}`,
    `Client : ${params.customerName}`,
    `Montant : ${formatCurrency(params.totalAmount)}`,
    `Lien admin : ${adminUrl}`,
  ].join('\n');

  const adminEmails = process.env.ADMIN_NOTIF_EMAILS || RESEND_FROM_EMAIL;
  await safeSendEmail({ to: adminEmails, subject, html, text });
}

export async function sendLowStockAlert(params: {
  productName: string;
  variantLabel?: string;
  remainingStock: number;
}) {
  const adminUrl = `${FRONTEND_URL}/admin/products`;
  const subject = `⚠️ Alerte Stock Faible : ${params.productName}`;
  const itemLabel = params.variantLabel ? `${params.productName} (${params.variantLabel})` : params.productName;
  
  const html = wrapEmail(
    'Alerte de Stock',
    `Attention, le stock de "${itemLabel}" est presque épuisé.`,
    `
      <div style="padding:24px;border-radius:18px;background:#fff7ed;border:1px solid #ffedd5;text-align:center;">
        <div style="font-size:14px;color:#9a3412;margin-bottom:8px;">STOCK RESTANT</div>
        <div style="font-size:48px;font-weight:bold;color:#c2410c;">${params.remainingStock}</div>
      </div>
      <p style="margin-top:20px;color:#4b5563;line-height:1.6;">
        Nous vous recommandons de réapprovisionner ce produit rapidement pour éviter une rupture de stock.
      </p>
    `,
    'Gérer les stocks',
    adminUrl
  );

  const text = [
    `Alerte Stock Faible : ${itemLabel}`,
    `Stock restant : ${params.remainingStock}`,
    `Gérer ici : ${adminUrl}`,
  ].join('\n');

  const adminEmails = process.env.ADMIN_NOTIF_EMAILS || RESEND_FROM_EMAIL;
  await safeSendEmail({ to: adminEmails, subject, html, text });
}

export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
}) {
  const shopUrl = `${FRONTEND_URL}/shop`;
  const subject = 'Bienvenue chez AGRIKIRI ! 🌿';
  const intro = `Bonjour ${params.firstName}, nous sommes ravis de vous compter parmi nous.`;
  const html = wrapEmail(
    'Bienvenue !',
    intro,
    `
      <p style="margin:0;color:#4b5563;line-height:1.7;">
        Votre compte a été créé avec succès. Vous pouvez dès maintenant explorer notre boutique et découvrir le meilleur des produits locaux haïtiens.
      </p>
      <div style="margin-top:24px;padding:20px;border-radius:18px;background:#f8fbf5;border:1px solid #dfead8;color:#374151;">
        <strong>Pourquoi AGRIKIRI ?</strong><br />
        Nous travaillons directement avec les producteurs locaux pour vous offrir des produits frais, authentiques et de qualité supérieure.
      </div>
    `,
    'Découvrir la boutique',
    shopUrl
  );

  const text = [
    `Bonjour ${params.firstName},`,
    'Bienvenue chez AGRIKIRI !',
    'Votre compte a été créé avec succès.',
    '',
    `Découvrez nos produits : ${shopUrl}`,
  ].join('\n');

  await safeSendEmail({ to: params.to, subject, html, text });
}
