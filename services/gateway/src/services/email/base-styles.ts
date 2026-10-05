/**
 * La feuille de style commune des e-mails (clair + sombre) — sortie
 * d'`EmailService` (#8238) avant que la garde des destinataires n'y entre.
 * Texte inchangé.
 *
 * @module services/email/base-styles
 */

export function emailBaseStyles(): string {
  // Light mode styles
  const lightStyles = `
    body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background-color:#ffffff}
    .container{max-width:600px;margin:0 auto;padding:20px}
    .header{background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white;padding:30px;text-align:center;border-radius:8px 8px 0 0}
    .header h1{margin:0;font-size:24px}
    .content{background:#f9fafb;padding:30px;border-radius:0 0 8px 8px;color:#333}
    .content p{color:#333}
    .content strong{color:#111}
    .button{display:inline-block;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white!important;padding:14px 32px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold}
    .footer{margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center}
    .info{background:#EEF2FF;border-left:4px solid #6366F1;padding:12px;margin:20px 0;border-radius:4px;color:#3730a3}
    .warning{background:#fef2f2;border-left:4px solid #ef4444;padding:12px;margin:20px 0;border-radius:4px;color:#991b1b}
    .success{background:#f0fdf4;border-left:4px solid #22c55e;padding:12px;margin:20px 0;border-radius:4px;color:#166534}
    .link-text{color:#6366F1}
  `;

  // Dark mode styles (for clients that support @media prefers-color-scheme)
  const darkStyles = `
    @media (prefers-color-scheme:dark){
      body{background-color:#111827!important;color:#e5e7eb!important}
      .container{background-color:#111827!important}
      .content{background:#1f2937!important;color:#e5e7eb!important}
      .content p{color:#d1d5db!important}
      .content strong{color:#f3f4f6!important}
      .footer{border-top-color:#374151!important;color:#9ca3af!important}
      .info{background:#312e81!important;color:#c7d2fe!important}
      .warning{background:#7f1d1d!important;color:#fecaca!important}
      .success{background:#14532d!important;color:#bbf7d0!important}
      .link-text{color:#a5b4fc!important}
    }
  `;

  return (lightStyles + darkStyles).replace(/\s+/g, ' ').trim();
}
