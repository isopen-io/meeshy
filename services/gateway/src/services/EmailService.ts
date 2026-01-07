/**
 * Multi-Provider Email Service
 *
 * Providers ordered by cost (cheapest first):
 * 1. Brevo (Sendinblue) - ~€0.00008/email
 * 2. SendGrid - ~€0.00010/email
 * 3. Mailgun - ~€0.00080/email
 *
 * Automatic fallback: If one provider fails, tries the next one
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProviderConfig {
  name: string;
  apiKey: string;
  enabled: boolean;
  priority: number; // Lower = higher priority (cheaper)
}

export interface EmailResult {
  success: boolean;
  provider?: string;
  error?: string;
  messageId?: string;
}

export interface PasswordResetEmailData {
  to: string;
  name: string;
  resetLink: string;
  expiryMinutes: number;
}

export interface EmailVerificationData {
  to: string;
  name: string;
  verificationLink: string;
  expiryHours: number;
}

export interface PasswordChangedEmailData {
  to: string;
  name: string;
  timestamp: string;
  ipAddress: string;
  location: string;
}

export interface SecurityAlertEmailData {
  to: string;
  name: string;
  alertType: string;
  details: string;
}

// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

export class EmailService {
  private providers: EmailProviderConfig[] = [];
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@meeshy.me';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Meeshy';
    this.initializeProviders();
  }

  /**
   * Initialize providers ordered by cost (cheapest first)
   */
  private initializeProviders(): void {
    // Priority 1: Brevo (cheapest - ~€0.00008/email)
    if (process.env.BREVO_API_KEY) {
      this.providers.push({
        name: 'brevo',
        apiKey: process.env.BREVO_API_KEY,
        enabled: true,
        priority: 1
      });
    }

    // Priority 2: SendGrid (~€0.00010/email)
    if (process.env.SENDGRID_API_KEY) {
      this.providers.push({
        name: 'sendgrid',
        apiKey: process.env.SENDGRID_API_KEY,
        enabled: true,
        priority: 2
      });
    }

    // Priority 3: Mailgun (most expensive - ~€0.00080/email)
    if (process.env.MAILGUN_API_KEY) {
      this.providers.push({
        name: 'mailgun',
        apiKey: process.env.MAILGUN_API_KEY,
        enabled: true,
        priority: 3
      });
    }

    // Sort by priority (cheapest first)
    this.providers.sort((a, b) => a.priority - b.priority);

    console.log('[EmailService] Initialized with providers:',
      this.providers.map(p => `${p.name} (priority: ${p.priority})`).join(', ') || 'none');
  }

  /**
   * Get list of configured providers
   */
  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  // ==========================================================================
  // CORE SEND METHOD WITH FALLBACK
  // ==========================================================================

  /**
   * Send email with automatic fallback to next provider on failure
   */
  private async sendEmail(data: EmailData): Promise<EmailResult> {
    const { to, subject, html, text } = data;

    if (this.providers.length === 0) {
      console.warn('[EmailService] ⚠️ No email providers configured - email not sent to:', to);
      console.log('[EmailService] Subject:', subject);
      return { success: false, error: 'No email providers configured' };
    }

    const errors: string[] = [];

    // Try each provider in order of priority (cost)
    for (const provider of this.providers) {
      if (!provider.enabled) continue;

      try {
        console.log(`[EmailService] Trying provider: ${provider.name}`);

        let result: EmailResult;

        switch (provider.name) {
          case 'brevo':
            result = await this.sendViaBrevo(provider.apiKey, { to, subject, html, text });
            break;
          case 'sendgrid':
            result = await this.sendViaSendGrid(provider.apiKey, { to, subject, html, text });
            break;
          case 'mailgun':
            result = await this.sendViaMailgun(provider.apiKey, { to, subject, html, text });
            break;
          default:
            continue;
        }

        if (result.success) {
          console.log(`[EmailService] ✅ Email sent via ${provider.name} to:`, to);
          return { ...result, provider: provider.name };
        } else {
          errors.push(`${provider.name}: ${result.error}`);
          console.warn(`[EmailService] ⚠️ ${provider.name} failed:`, result.error);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${provider.name}: ${errorMsg}`);
        console.error(`[EmailService] ❌ ${provider.name} exception:`, error);
      }
    }

    // All providers failed
    console.error('[EmailService] ❌ All providers failed for:', to);
    return {
      success: false,
      error: `All providers failed: ${errors.join('; ')}`
    };
  }

  // ==========================================================================
  // PROVIDER IMPLEMENTATIONS
  // ==========================================================================

  /**
   * Send via Brevo (Sendinblue) - Priority 1 (cheapest)
   */
  private async sendViaBrevo(apiKey: string, data: EmailData): Promise<EmailResult> {
    const { to, subject, html, text } = data;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: this.fromName, email: this.fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Brevo API error ${response.status}: ${error}` };
    }

    const result = await response.json();
    return { success: true, messageId: result.messageId };
  }

  /**
   * Send via SendGrid - Priority 2
   */
  private async sendViaSendGrid(apiKey: string, data: EmailData): Promise<EmailResult> {
    const { to, subject, html, text } = data;

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromEmail, name: this.fromName },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `SendGrid API error ${response.status}: ${error}` };
    }

    // SendGrid returns 202 with no body on success
    const messageId = response.headers.get('x-message-id') || undefined;
    return { success: true, messageId };
  }

  /**
   * Send via Mailgun - Priority 3 (most expensive)
   */
  private async sendViaMailgun(apiKey: string, data: EmailData): Promise<EmailResult> {
    const { to, subject, html, text } = data;
    const domain = process.env.MAILGUN_DOMAIN || '';

    if (!domain) {
      return { success: false, error: 'MAILGUN_DOMAIN not configured' };
    }

    const formData = new URLSearchParams({
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      text,
      html
    });

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Mailgun API error ${response.status}: ${error}` };
    }

    const result = await response.json();
    return { success: true, messageId: result.id };
  }

  // ==========================================================================
  // EMAIL TEMPLATES
  // ==========================================================================

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    const { to, name, resetLink, expiryMinutes } = data;

    const subject = 'Réinitialisez votre mot de passe - Meeshy';
    const html = this.getPasswordResetTemplate(name, resetLink, expiryMinutes);
    const text = this.getPasswordResetTextTemplate(name, resetLink, expiryMinutes);

    return this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: EmailVerificationData): Promise<EmailResult> {
    const { to, name, verificationLink, expiryHours } = data;

    const subject = 'Vérifiez votre adresse email - Meeshy';
    const html = this.getEmailVerificationTemplate(name, verificationLink, expiryHours);
    const text = this.getEmailVerificationTextTemplate(name, verificationLink, expiryHours);

    return this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<EmailResult> {
    const { to, name, timestamp, ipAddress, location } = data;

    const subject = 'Votre mot de passe a été modifié - Meeshy';
    const html = this.getPasswordChangedTemplate(name, timestamp, ipAddress, location);
    const text = this.getPasswordChangedTextTemplate(name, timestamp, ipAddress, location);

    return this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send security alert email
   */
  async sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<EmailResult> {
    const { to, name, alertType, details } = data;

    const subject = `Alerte de sécurité: ${alertType} - Meeshy`;
    const html = this.getSecurityAlertTemplate(name, alertType, details);
    const text = this.getSecurityAlertTextTemplate(name, alertType, details);

    return this.sendEmail({ to, subject, html, text });
  }

  // ==========================================================================
  // HTML TEMPLATES
  // ==========================================================================

  private getBaseStyles(): string {
    return `
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .header h1 { margin: 0; font-size: 24px; }
      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
      .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
      .info { background: #EEF2FF; border-left: 4px solid #6366F1; padding: 12px; margin: 20px 0; border-radius: 4px; }
      .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; border-radius: 4px; }
      .success { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; margin: 20px 0; border-radius: 4px; }
    `;
  }

  private getEmailVerificationTemplate(name: string, verificationLink: string, expiryHours: number): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vérification de votre email</title>
        <style>${this.getBaseStyles()}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Bienvenue sur Meeshy !</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${name}</strong>,</p>
            <p>Merci de vous être inscrit sur Meeshy ! Pour activer votre compte, veuillez vérifier votre adresse email :</p>
            <div style="text-align: center;">
              <a href="${verificationLink}" class="button">✓ Vérifier mon email</a>
            </div>
            <p style="word-break: break-all; color: #6366F1; font-size: 14px;">${verificationLink}</p>
            <div class="info">
              <strong>ℹ️ À savoir :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Ce lien expire dans <strong>${expiryHours} heures</strong></li>
                <li>Si vous n'avez pas créé de compte, ignorez cet email</li>
              </ul>
            </div>
            <p>À très bientôt sur Meeshy !<br><strong>L'équipe Meeshy</strong></p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Meeshy. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getEmailVerificationTextTemplate(name: string, verificationLink: string, expiryHours: number): string {
    return `
Bienvenue sur Meeshy !

Bonjour ${name},

Merci de vous être inscrit ! Pour activer votre compte, cliquez sur ce lien :
${verificationLink}

Ce lien expire dans ${expiryHours} heures.

À très bientôt sur Meeshy !
L'équipe Meeshy

© ${new Date().getFullYear()} Meeshy
    `.trim();
  }

  private getPasswordResetTemplate(name: string, resetLink: string, expiryMinutes: number): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réinitialisation de mot de passe</title>
        <style>${this.getBaseStyles()}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Réinitialisation de mot de passe</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${name}</strong>,</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe Meeshy :</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Réinitialiser le mot de passe</a>
            </div>
            <div class="warning">
              <strong>⚠️ Attention :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Ce lien expire dans <strong>${expiryMinutes} minutes</strong></li>
                <li>Si vous n'avez pas fait cette demande, ignorez cet email</li>
              </ul>
            </div>
            <p>L'équipe Meeshy</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Meeshy. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetTextTemplate(name: string, resetLink: string, expiryMinutes: number): string {
    return `
Réinitialisation de mot de passe - Meeshy

Bonjour ${name},

Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur ce lien :
${resetLink}

Ce lien expire dans ${expiryMinutes} minutes.

Si vous n'avez pas fait cette demande, ignorez cet email.

L'équipe Meeshy

© ${new Date().getFullYear()} Meeshy
    `.trim();
  }

  private getPasswordChangedTemplate(name: string, timestamp: string, ipAddress: string, location: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mot de passe modifié</title>
        <style>${this.getBaseStyles()}</style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
            <h1>✓ Mot de passe modifié</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${name}</strong>,</p>
            <p>Votre mot de passe Meeshy a été modifié avec succès.</p>
            <div class="success">
              <strong>Détails :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li><strong>Date :</strong> ${new Date(timestamp).toLocaleString('fr-FR')}</li>
                <li><strong>IP :</strong> ${ipAddress}</li>
                <li><strong>Localisation :</strong> ${location}</li>
              </ul>
            </div>
            <div class="warning">
              <strong>⚠️ Ce n'était pas vous ?</strong>
              <p>Contactez immédiatement notre support : security@meeshy.me</p>
            </div>
            <p>L'équipe Meeshy</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Meeshy. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordChangedTextTemplate(name: string, timestamp: string, ipAddress: string, location: string): string {
    return `
Mot de passe modifié - Meeshy

Bonjour ${name},

Votre mot de passe a été modifié avec succès.

Détails :
- Date : ${new Date(timestamp).toLocaleString('fr-FR')}
- IP : ${ipAddress}
- Localisation : ${location}

Ce n'était pas vous ? Contactez security@meeshy.me

L'équipe Meeshy

© ${new Date().getFullYear()} Meeshy
    `.trim();
  }

  private getSecurityAlertTemplate(name: string, alertType: string, details: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Alerte de sécurité</title>
        <style>${this.getBaseStyles()}</style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
            <h1>🚨 Alerte de sécurité</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${name}</strong>,</p>
            <div class="warning">
              <strong>Type d'alerte :</strong> ${alertType}<br>
              <strong>Détails :</strong> ${details}
            </div>
            <p><strong>Actions recommandées :</strong></p>
            <ul>
              <li>Changez votre mot de passe immédiatement</li>
              <li>Vérifiez vos appareils connectés</li>
              <li>Activez l'authentification à deux facteurs</li>
            </ul>
            <p>L'équipe Sécurité Meeshy</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Meeshy. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getSecurityAlertTextTemplate(name: string, alertType: string, details: string): string {
    return `
🚨 Alerte de sécurité - Meeshy

Bonjour ${name},

Type d'alerte : ${alertType}
Détails : ${details}

Actions recommandées :
- Changez votre mot de passe immédiatement
- Vérifiez vos appareils connectés
- Activez l'authentification à deux facteurs

L'équipe Sécurité Meeshy

© ${new Date().getFullYear()} Meeshy
    `.trim();
  }
}
