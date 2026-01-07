/**
 * Email Service for sending transactional emails
 * Supports Brevo (formerly Sendinblue), SendGrid and Mailgun (configurable)
 */

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

export class EmailService {
  private provider: 'brevo' | 'sendgrid' | 'mailgun';
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    // Default to Brevo, then SendGrid, then Mailgun
    if (process.env.BREVO_API_KEY) {
      this.provider = 'brevo';
      this.apiKey = process.env.BREVO_API_KEY;
    } else if (process.env.SENDGRID_API_KEY) {
      this.provider = 'sendgrid';
      this.apiKey = process.env.SENDGRID_API_KEY;
    } else if (process.env.MAILGUN_API_KEY) {
      this.provider = 'mailgun';
      this.apiKey = process.env.MAILGUN_API_KEY;
    } else {
      this.provider = (process.env.EMAIL_PROVIDER as 'brevo' | 'sendgrid' | 'mailgun') || 'brevo';
      this.apiKey = '';
    }
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@meeshy.me';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Meeshy';
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const { to, name, resetLink, expiryMinutes } = data;

    const subject = 'Reset Your Password - Meeshy';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 8px; margin-top: 20px; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                    font-size: 12px; color: #6b7280; text-align: center; }
          .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
          </div>

          <div class="content">
            <p>Hello ${name},</p>

            <p>We received a request to reset your password for your Meeshy account.
            Click the button below to create a new password:</p>

            <a href="${resetLink}" class="button">Reset Password</a>

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5;">${resetLink}</p>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>This link will expire in <strong>${expiryMinutes} minutes</strong></li>
                <li>The link can only be used once</li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password will not change unless you click the link above</li>
              </ul>
            </div>

            <p>If you didn't request a password reset, you can safely ignore this email.
            Your account remains secure.</p>

            <p>Thanks,<br>The Meeshy Team</p>
          </div>

          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Meeshy. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Reset Your Password - Meeshy

Hello ${name},

We received a request to reset your password for your Meeshy account.
Click the link below to create a new password:

${resetLink}

SECURITY NOTICE:
- This link will expire in ${expiryMinutes} minutes
- The link can only be used once
- If you didn't request this, please ignore this email
- Your password will not change unless you click the link above

If you didn't request a password reset, you can safely ignore this email.

Thanks,
The Meeshy Team

---
This is an automated email. Please do not reply to this message.
© ${new Date().getFullYear()} Meeshy. All rights reserved.
    `.trim();

    await this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: EmailVerificationData): Promise<void> {
    const { to, name, verificationLink, expiryHours } = data;

    const subject = 'Vérifiez votre adresse email - Meeshy';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vérification de votre email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: white; padding: 14px 32px;
                    text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
          .button:hover { opacity: 0.9; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                    font-size: 12px; color: #6b7280; text-align: center; }
          .info { background: #EEF2FF; border-left: 4px solid #6366F1; padding: 12px; margin: 20px 0; border-radius: 4px; }
          .welcome-emoji { font-size: 48px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="welcome-emoji">🎉</div>
            <h1>Bienvenue sur Meeshy !</h1>
          </div>

          <div class="content">
            <p>Bonjour <strong>${name}</strong>,</p>

            <p>Merci de vous être inscrit sur Meeshy ! Pour activer votre compte et commencer à discuter
            avec le monde entier, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>

            <div style="text-align: center;">
              <a href="${verificationLink}" class="button">✓ Vérifier mon email</a>
            </div>

            <p>Ou copiez et collez ce lien dans votre navigateur :</p>
            <p style="word-break: break-all; color: #6366F1; font-size: 14px;">${verificationLink}</p>

            <div class="info">
              <strong>ℹ️ À savoir :</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Ce lien expire dans <strong>${expiryHours} heures</strong></li>
                <li>Si vous n'avez pas créé de compte Meeshy, ignorez simplement cet email</li>
              </ul>
            </div>

            <p>Une fois vérifié, vous pourrez profiter de toutes les fonctionnalités de Meeshy :</p>
            <ul>
              <li>💬 Discuter dans n'importe quelle langue</li>
              <li>🌍 Traduction automatique en temps réel</li>
              <li>🎤 Messages vocaux traduits</li>
              <li>👥 Rejoindre des communautés du monde entier</li>
            </ul>

            <p>À très bientôt sur Meeshy !<br>
            <strong>L'équipe Meeshy</strong></p>
          </div>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
            <p>&copy; ${new Date().getFullYear()} Meeshy. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Bienvenue sur Meeshy !

Bonjour ${name},

Merci de vous être inscrit sur Meeshy ! Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :

${verificationLink}

À SAVOIR :
- Ce lien expire dans ${expiryHours} heures
- Si vous n'avez pas créé de compte Meeshy, ignorez simplement cet email

Une fois vérifié, vous pourrez profiter de toutes les fonctionnalités de Meeshy !

À très bientôt sur Meeshy !
L'équipe Meeshy

---
Cet email a été envoyé automatiquement. Merci de ne pas y répondre.
© ${new Date().getFullYear()} Meeshy. Tous droits réservés.
    `.trim();

    await this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<void> {
    const { to, name, timestamp, ipAddress, location } = data;

    const subject = 'Your Password Was Changed - Meeshy';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Changed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 8px; margin-top: 20px; }
          .info-box { background: white; padding: 15px; border-radius: 6px; margin: 20px 0;
                      border-left: 4px solid #10B981; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                    font-size: 12px; color: #6b7280; text-align: center; }
          .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
          .support-link { color: #4F46E5; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Password Changed Successfully</h1>
          </div>

          <div class="content">
            <p>Hello ${name},</p>

            <p>Your Meeshy account password was successfully changed.</p>

            <div class="info-box">
              <strong>Change Details:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</li>
                <li><strong>IP Address:</strong> ${ipAddress}</li>
                <li><strong>Location:</strong> ${location}</li>
              </ul>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>All existing sessions have been logged out for security</li>
              <li>You'll need to sign in again with your new password</li>
              <li>Your account remains secure</li>
            </ul>

            <div class="alert">
              <strong>⚠️ Didn't make this change?</strong>
              <p style="margin: 10px 0;">If you didn't change your password, your account may be compromised.
              Please <a href="mailto:security@meeshy.com" class="support-link">contact our security team</a> immediately.</p>
            </div>

            <p>Thanks,<br>The Meeshy Team</p>
          </div>

          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Meeshy. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Password Changed Successfully - Meeshy

Hello ${name},

Your Meeshy account password was successfully changed.

CHANGE DETAILS:
- Time: ${new Date(timestamp).toLocaleString()}
- IP Address: ${ipAddress}
- Location: ${location}

WHAT HAPPENS NEXT:
- All existing sessions have been logged out for security
- You'll need to sign in again with your new password
- Your account remains secure

⚠️ DIDN'T MAKE THIS CHANGE?
If you didn't change your password, your account may be compromised.
Please contact our security team immediately: security@meeshy.com

Thanks,
The Meeshy Team

---
This is an automated email. Please do not reply to this message.
© ${new Date().getFullYear()} Meeshy. All rights reserved.
    `.trim();

    await this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send security alert email
   */
  async sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<void> {
    const { to, name, alertType, details } = data;

    const subject = `Security Alert: ${alertType} - Meeshy`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #DC2626; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 8px; margin-top: 20px; }
          .alert-box { background: #fef2f2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                    font-size: 12px; color: #6b7280; text-align: center; }
          .button { display: inline-block; background: #DC2626; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Security Alert</h1>
          </div>

          <div class="content">
            <p>Hello ${name},</p>

            <div class="alert-box">
              <strong>Alert Type:</strong> ${alertType}<br>
              <strong>Details:</strong> ${details}
            </div>

            <p><strong>We detected suspicious activity on your account.</strong></p>

            <p>Recommended Actions:</p>
            <ul>
              <li>Change your password immediately if you suspect unauthorized access</li>
              <li>Review your recent account activity</li>
              <li>Enable two-factor authentication (2FA) for extra security</li>
              <li>Check connected devices and sessions</li>
            </ul>

            <a href="${process.env.FRONTEND_URL}/security" class="button">Review Security Settings</a>

            <p>If you have any concerns, please contact our security team at
            <a href="mailto:security@meeshy.com">security@meeshy.com</a></p>

            <p>Stay safe,<br>The Meeshy Security Team</p>
          </div>

          <div class="footer">
            <p>This is an automated security alert.</p>
            <p>&copy; ${new Date().getFullYear()} Meeshy. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
🚨 Security Alert - Meeshy

Hello ${name},

ALERT TYPE: ${alertType}
DETAILS: ${details}

We detected suspicious activity on your account.

RECOMMENDED ACTIONS:
- Change your password immediately if you suspect unauthorized access
- Review your recent account activity
- Enable two-factor authentication (2FA) for extra security
- Check connected devices and sessions

Review your security settings: ${process.env.FRONTEND_URL}/security

If you have any concerns, please contact our security team:
security@meeshy.com

Stay safe,
The Meeshy Security Team

---
This is an automated security alert.
© ${new Date().getFullYear()} Meeshy. All rights reserved.
    `.trim();

    await this.sendEmail({ to, subject, html, text });
  }

  /**
   * Generic email sending method
   */
  private async sendEmail(data: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { to, subject, html, text } = data;

    if (!this.apiKey) {
      console.warn('[EmailService] ⚠️ No API key configured - email not sent to:', to);
      console.log('[EmailService] Subject:', subject);
      return;
    }

    if (this.provider === 'brevo') {
      await this.sendViaBrevo({ to, subject, html, text });
    } else if (this.provider === 'sendgrid') {
      await this.sendViaSendGrid({ to, subject, html, text });
    } else if (this.provider === 'mailgun') {
      await this.sendViaMailgun({ to, subject, html, text });
    } else {
      console.error('[EmailService] Invalid email provider:', this.provider);
      throw new Error('Invalid email provider');
    }
  }

  /**
   * Send email via Brevo (formerly Sendinblue)
   */
  private async sendViaBrevo(data: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { to, subject, html, text } = data;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: this.fromName,
            email: this.fromEmail
          },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[EmailService] Brevo error:', error);
        throw new Error(`Brevo API error: ${response.status}`);
      }

      console.log('[EmailService] ✅ Email sent via Brevo to:', to);
    } catch (error) {
      console.error('[EmailService] Failed to send email via Brevo:', error);
      throw error;
    }
  }

  /**
   * Send email via SendGrid
   */
  private async sendViaSendGrid(data: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { to, subject, html, text } = data;

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
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
        console.error('[EmailService] SendGrid error:', error);
        throw new Error(`SendGrid API error: ${response.status}`);
      }

      console.log('[EmailService] ✅ Email sent via SendGrid to:', to);
    } catch (error) {
      console.error('[EmailService] Failed to send email via SendGrid:', error);
      throw error;
    }
  }

  /**
   * Send email via Mailgun
   */
  private async sendViaMailgun(data: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { to, subject, html, text } = data;

    try {
      const domain = process.env.MAILGUN_DOMAIN || '';
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
          'Authorization': `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[EmailService] Mailgun error:', error);
        throw new Error(`Mailgun API error: ${response.status}`);
      }

      console.log('[EmailService] ✅ Email sent via Mailgun to:', to);
    } catch (error) {
      console.error('[EmailService] Failed to send email via Mailgun:', error);
      throw error;
    }
  }
}
