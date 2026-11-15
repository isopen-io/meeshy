/**
 * Les trois fournisseurs d'envoi (Brevo → SendGrid → Mailgun) — sortis
 * d'`EmailService` (hors budget, #4426) quand #8036 a dû y ajouter le
 * marquage de staging. Chacun reçoit l'e-mail DÉJÀ composé et marqué : ce
 * module ne décide de rien, il transporte.
 *
 * @module services/email/providers
 */

import axios from 'axios';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'EmailService' });

export type EmailSender = { readonly name: string; readonly email: string };

export type ProviderEmail = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

export type ProviderResult = { success: boolean; messageId?: string; error?: string };

export async function sendViaBrevo(apiKey: string, sender: EmailSender, data: ProviderEmail): Promise<ProviderResult> {
  logger.info(`[EmailService] [Brevo] 📤 Sending to Brevo API...`);
  const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
    sender: { name: sender.name, email: sender.email },
    to: [{ email: data.to }],
    subject: data.subject,
    htmlContent: data.html,
    textContent: data.text
  }, {
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' }
  });
  logger.info(`[EmailService] [Brevo] ✅ API Response Status: ${response.status}`);
  return { success: true, messageId: response.data.messageId };
}

export async function sendViaSendGrid(apiKey: string, sender: EmailSender, data: ProviderEmail): Promise<ProviderResult> {
  const response = await axios.post('https://api.sendgrid.com/v3/mail/send', {
    personalizations: [{ to: [{ email: data.to }] }],
    from: { email: sender.email, name: sender.name },
    subject: data.subject,
    content: [{ type: 'text/plain', value: data.text }, { type: 'text/html', value: data.html }]
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  });
  return { success: true, messageId: response.headers['x-message-id'] || undefined };
}

export async function sendViaMailgun(apiKey: string, sender: EmailSender, data: ProviderEmail): Promise<ProviderResult> {
  const domain = process.env.MAILGUN_DOMAIN || '';
  if (!domain) return { success: false, error: 'MAILGUN_DOMAIN not configured' };

  const response = await axios.post(
    `https://api.mailgun.net/v3/${domain}/messages`,
    new URLSearchParams({
      from: `${sender.name} <${sender.email}>`,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html
    }),
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return { success: true, messageId: response.data.id };
}
