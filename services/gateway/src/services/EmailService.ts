/**
 * Multi-Provider Email Service with i18n Support
 *
 * Providers ordered by cost (cheapest first):
 * 1. Brevo (Sendinblue) - ~€0.00008/email
 * 2. SendGrid - ~€0.00010/email
 * 3. Mailgun - ~€0.00080/email
 *
 * Automatic fallback: If one provider fails, tries the next one
 * i18n: Emails sent in user's preferred language (systemLanguage)
 */

import axios from 'axios';

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
  priority: number;
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
  language?: string;
}

export interface EmailVerificationData {
  to: string;
  name: string;
  verificationLink: string;
  expiryHours: number;
  language?: string;
}

export interface PasswordChangedEmailData {
  to: string;
  name: string;
  timestamp: string;
  ipAddress: string;
  location: string;
  language?: string;
}

export interface SecurityAlertEmailData {
  to: string;
  name: string;
  alertType: string;
  details: string;
  language?: string;
}

export interface MagicLinkEmailData {
  to: string;
  name: string;
  magicLink: string;
  location: string;
  language?: string;
}

// ============================================================================
// I18N TRANSLATIONS
// ============================================================================

type SupportedLanguage = 'fr' | 'en' | 'es' | 'pt';

interface EmailTranslations {
  common: {
    greeting: string;
    footer: string;
    copyright: string;
  };
  verification: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    expiry: string;
    ignoreNote: string;
  };
  passwordReset: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    expiry: string;
    ignoreNote: string;
  };
  passwordChanged: {
    subject: string;
    title: string;
    intro: string;
    warning: string;
  };
  securityAlert: {
    subject: string;
    title: string;
    actions: string;
    action1: string;
    action2: string;
    action3: string;
  };
}

const translations: Record<SupportedLanguage, EmailTranslations> = {
  fr: {
    common: {
      greeting: 'Bonjour',
      footer: "L'équipe Meeshy",
      copyright: '© {year} Meeshy. Tous droits réservés.'
    },
    verification: {
      subject: 'Vérifiez votre adresse email - Meeshy',
      title: 'Bienvenue sur Meeshy !',
      intro: 'Merci de vous être inscrit sur Meeshy ! Pour activer votre compte, veuillez vérifier votre adresse email :',
      buttonText: 'Vérifier mon email',
      expiry: 'Ce lien expire dans {hours} heures.',
      ignoreNote: "Si vous n'avez pas créé de compte, ignorez cet email"
    },
    passwordReset: {
      subject: 'Réinitialisez votre mot de passe - Meeshy',
      title: 'Réinitialisation de mot de passe',
      intro: 'Vous avez demandé à réinitialiser votre mot de passe Meeshy :',
      buttonText: 'Réinitialiser le mot de passe',
      expiry: 'Ce lien expire dans {minutes} minutes.',
      ignoreNote: "Si vous n'avez pas fait cette demande, ignorez cet email"
    },
    passwordChanged: {
      subject: 'Votre mot de passe a été modifié - Meeshy',
      title: 'Mot de passe modifié',
      intro: 'Votre mot de passe Meeshy a été modifié avec succès.',
      warning: "Ce n'était pas vous ? Contactez immédiatement notre support : security@meeshy.me"
    },
    securityAlert: {
      subject: 'Alerte de sécurité - Meeshy',
      title: 'Alerte de sécurité',
      actions: 'Actions recommandées :',
      action1: 'Changez votre mot de passe immédiatement',
      action2: 'Vérifiez vos appareils connectés',
      action3: "Activez l'authentification à deux facteurs"
    }
  },
  en: {
    common: {
      greeting: 'Hello',
      footer: 'The Meeshy Team',
      copyright: '© {year} Meeshy. All rights reserved.'
    },
    verification: {
      subject: 'Verify your email address - Meeshy',
      title: 'Welcome to Meeshy!',
      intro: 'Thank you for signing up for Meeshy! To activate your account, please verify your email address:',
      buttonText: 'Verify my email',
      expiry: 'This link expires in {hours} hours.',
      ignoreNote: 'If you did not create an account, please ignore this email'
    },
    passwordReset: {
      subject: 'Reset your password - Meeshy',
      title: 'Password Reset',
      intro: 'You have requested to reset your Meeshy password:',
      buttonText: 'Reset password',
      expiry: 'This link expires in {minutes} minutes.',
      ignoreNote: 'If you did not make this request, please ignore this email'
    },
    passwordChanged: {
      subject: 'Your password has been changed - Meeshy',
      title: 'Password Changed',
      intro: 'Your Meeshy password has been successfully changed.',
      warning: "Wasn't you? Contact our support immediately: security@meeshy.me"
    },
    securityAlert: {
      subject: 'Security Alert - Meeshy',
      title: 'Security Alert',
      actions: 'Recommended actions:',
      action1: 'Change your password immediately',
      action2: 'Check your connected devices',
      action3: 'Enable two-factor authentication'
    }
  },
  es: {
    common: {
      greeting: 'Hola',
      footer: 'El equipo de Meeshy',
      copyright: '© {year} Meeshy. Todos los derechos reservados.'
    },
    verification: {
      subject: 'Verifica tu correo electrónico - Meeshy',
      title: '¡Bienvenido a Meeshy!',
      intro: '¡Gracias por registrarte en Meeshy! Para activar tu cuenta, verifica tu correo electrónico:',
      buttonText: 'Verificar mi correo',
      expiry: 'Este enlace expira en {hours} horas.',
      ignoreNote: 'Si no creaste una cuenta, ignora este correo'
    },
    passwordReset: {
      subject: 'Restablece tu contraseña - Meeshy',
      title: 'Restablecimiento de contraseña',
      intro: 'Has solicitado restablecer tu contraseña de Meeshy:',
      buttonText: 'Restablecer contraseña',
      expiry: 'Este enlace expira en {minutes} minutos.',
      ignoreNote: 'Si no hiciste esta solicitud, ignora este correo'
    },
    passwordChanged: {
      subject: 'Tu contraseña ha sido cambiada - Meeshy',
      title: 'Contraseña cambiada',
      intro: 'Tu contraseña de Meeshy ha sido cambiada exitosamente.',
      warning: '¿No fuiste tú? Contacta inmediatamente a nuestro soporte: security@meeshy.me'
    },
    securityAlert: {
      subject: 'Alerta de seguridad - Meeshy',
      title: 'Alerta de seguridad',
      actions: 'Acciones recomendadas:',
      action1: 'Cambia tu contraseña inmediatamente',
      action2: 'Verifica tus dispositivos conectados',
      action3: 'Activa la autenticación de dos factores'
    }
  },
  pt: {
    common: {
      greeting: 'Olá',
      footer: 'Equipe Meeshy',
      copyright: '© {year} Meeshy. Todos os direitos reservados.'
    },
    verification: {
      subject: 'Verifique seu email - Meeshy',
      title: 'Bem-vindo ao Meeshy!',
      intro: 'Obrigado por se cadastrar no Meeshy! Para ativar sua conta, verifique seu email:',
      buttonText: 'Verificar meu email',
      expiry: 'Este link expira em {hours} horas.',
      ignoreNote: 'Se você não criou uma conta, ignore este email'
    },
    passwordReset: {
      subject: 'Redefinir sua senha - Meeshy',
      title: 'Redefinição de Senha',
      intro: 'Você solicitou a redefinição da sua senha do Meeshy:',
      buttonText: 'Redefinir senha',
      expiry: 'Este link expira em {minutes} minutos.',
      ignoreNote: 'Se você não fez esta solicitação, ignore este email'
    },
    passwordChanged: {
      subject: 'Sua senha foi alterada - Meeshy',
      title: 'Senha Alterada',
      intro: 'Sua senha do Meeshy foi alterada com sucesso.',
      warning: 'Não foi você? Entre em contato imediatamente com nosso suporte: security@meeshy.me'
    },
    securityAlert: {
      subject: 'Alerta de segurança - Meeshy',
      title: 'Alerta de segurança',
      actions: 'Ações recomendadas:',
      action1: 'Altere sua senha imediatamente',
      action2: 'Verifique seus dispositivos conectados',
      action3: 'Ative a autenticação de dois fatores'
    }
  }
};

// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

export class EmailService {
  private providers: EmailProviderConfig[] = [];
  private fromEmail: string;
  private fromName: string;
  private defaultLanguage: SupportedLanguage = 'fr';
  private brandLogoUrl: string;
  private frontendUrl: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@meeshy.me';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Meeshy';
    this.brandLogoUrl = process.env.BRAND_LOGO_URL || 'https://meeshy.me/images/meeshy-logo.png';
    this.frontendUrl = process.env.FRONTEND_URL || 'https://meeshy.me';
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (process.env.BREVO_API_KEY) {
      this.providers.push({ name: 'brevo', apiKey: process.env.BREVO_API_KEY, enabled: true, priority: 1 });
    }
    if (process.env.SENDGRID_API_KEY) {
      this.providers.push({ name: 'sendgrid', apiKey: process.env.SENDGRID_API_KEY, enabled: true, priority: 2 });
    }
    if (process.env.MAILGUN_API_KEY) {
      this.providers.push({ name: 'mailgun', apiKey: process.env.MAILGUN_API_KEY, enabled: true, priority: 3 });
    }
    this.providers.sort((a, b) => a.priority - b.priority);
    console.log('[EmailService] Initialized with providers:', this.providers.map(p => p.name).join(', ') || 'none');
  }

  private getTranslations(language?: string): EmailTranslations {
    const lang = this.normalizeLanguage(language);
    return translations[lang] || translations[this.defaultLanguage];
  }

  private normalizeLanguage(language?: string): SupportedLanguage {
    if (!language) return this.defaultLanguage;
    const normalized = language.toLowerCase().substring(0, 2);
    const supported: SupportedLanguage[] = ['fr', 'en', 'es', 'pt'];
    return supported.includes(normalized as SupportedLanguage) ? (normalized as SupportedLanguage) : this.defaultLanguage;
  }

  private getLocale(language?: string): string {
    const lang = this.normalizeLanguage(language);
    const locales: Record<SupportedLanguage, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR' };
    return locales[lang];
  }

  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  private async sendEmail(data: EmailData): Promise<EmailResult> {
    const { to, subject, html, text } = data;
    console.log(`[EmailService] 📧 Preparing to send email to: ${to}`);
    console.log(`[EmailService] 📧 Subject: ${subject}`);

    if (this.providers.length === 0) {
      console.warn('[EmailService] ❌ No providers configured - email not sent to:', to);
      return { success: false, error: 'No email providers configured' };
    }

    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        console.log(`[EmailService] 🔄 Trying provider: ${provider.name}`);
        let result: EmailResult;
        switch (provider.name) {
          case 'brevo': result = await this.sendViaBrevo(provider.apiKey, data); break;
          case 'sendgrid': result = await this.sendViaSendGrid(provider.apiKey, data); break;
          case 'mailgun': result = await this.sendViaMailgun(provider.apiKey, data); break;
          default: continue;
        }
        if (result.success) {
          console.log(`[EmailService] ✅ Email sent successfully via ${provider.name}`);
          console.log(`[EmailService] ✅ Recipient: ${to}`);
          console.log(`[EmailService] ✅ Message ID: ${result.messageId || 'N/A'}`);
          return { ...result, provider: provider.name };
        }
        console.warn(`[EmailService] ⚠️ Provider ${provider.name} failed: ${result.error}`);
        errors.push(`${provider.name}: ${result.error}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[EmailService] ❌ Provider ${provider.name} threw exception: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
          console.error(`[EmailService] Stack trace: ${error.stack}`);
        }
        errors.push(`${provider.name}: ${errorMsg}`);
      }
    }
    console.error('[EmailService] ❌ All providers failed for:', to);
    console.error('[EmailService] ❌ Errors:', errors.join(' | '));
    return { success: false, error: `All providers failed: ${errors.join('; ')}` };
  }

  private async sendViaBrevo(apiKey: string, data: EmailData): Promise<EmailResult> {
    console.log(`[EmailService] [Brevo] 📤 Sending to Brevo API...`);
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: this.fromName, email: this.fromEmail },
      to: [{ email: data.to }],
      subject: data.subject,
      htmlContent: data.html,
      textContent: data.text
    }, {
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' }
    });
    console.log(`[EmailService] [Brevo] ✅ API Response Status: ${response.status}`);
    console.log(`[EmailService] [Brevo] ✅ Response Data:`, JSON.stringify(response.data));
    return { success: true, messageId: response.data.messageId };
  }

  private async sendViaSendGrid(apiKey: string, data: EmailData): Promise<EmailResult> {
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: data.to }] }],
      from: { email: this.fromEmail, name: this.fromName },
      subject: data.subject,
      content: [{ type: 'text/plain', value: data.text }, { type: 'text/html', value: data.html }]
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    return { success: true, messageId: response.headers['x-message-id'] || undefined };
  }

  private async sendViaMailgun(apiKey: string, data: EmailData): Promise<EmailResult> {
    const domain = process.env.MAILGUN_DOMAIN || '';
    if (!domain) return { success: false, error: 'MAILGUN_DOMAIN not configured' };

    const response = await axios.post(
      `https://api.mailgun.net/v3/${domain}/messages`,
      new URLSearchParams({
        from: `${this.fromName} <${this.fromEmail}>`,
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

  // ==========================================================================
  // EMAIL TEMPLATES (i18n)
  // ==========================================================================

  private getBaseStyles(): string {
    return `body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white;padding:30px;text-align:center;border-radius:8px 8px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9fafb;padding:30px;border-radius:0 0 8px 8px}.button{display:inline-block;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white;padding:14px 32px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center}.info{background:#EEF2FF;border-left:4px solid #6366F1;padding:12px;margin:20px 0;border-radius:4px}.warning{background:#fef2f2;border-left:4px solid #ef4444;padding:12px;margin:20px 0;border-radius:4px}.success{background:#f0fdf4;border-left:4px solid #22c55e;padding:12px;margin:20px 0;border-radius:4px}`;
  }

  async sendEmailVerification(data: EmailVerificationData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = t.verification.expiry.replace('{hours}', data.expiryHours.toString());
    const copyright = t.common.copyright.replace('{year}', new Date().getFullYear().toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>🎉 ${t.verification.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.verification.intro}</p><div style="text-align:center"><a href="${data.verificationLink}" class="button">✓ ${t.verification.buttonText}</a></div><p style="word-break:break-all;color:#6366F1;font-size:14px">${data.verificationLink}</p><div class="info"><strong>ℹ️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.verification.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer"><p>${copyright}</p></div></div></body></html>`;
    const text = `${t.verification.title}\n\n${t.common.greeting} ${data.name},\n\n${t.verification.intro}\n\n${data.verificationLink}\n\n${expiry}\n\n${t.verification.ignoreNote}\n\n${t.common.footer}\n\n${copyright}`;

    return this.sendEmail({ to: data.to, subject: t.verification.subject, html, text });
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = t.passwordReset.expiry.replace('{minutes}', data.expiryMinutes.toString());
    const copyright = t.common.copyright.replace('{year}', new Date().getFullYear().toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>🔐 ${t.passwordReset.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.passwordReset.intro}</p><div style="text-align:center"><a href="${data.resetLink}" class="button">${t.passwordReset.buttonText}</a></div><div class="warning"><strong>⚠️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.passwordReset.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer"><p>${copyright}</p></div></div></body></html>`;
    const text = `${t.passwordReset.title}\n\n${t.common.greeting} ${data.name},\n\n${t.passwordReset.intro}\n\n${data.resetLink}\n\n${expiry}\n\n${t.passwordReset.ignoreNote}\n\n${t.common.footer}\n\n${copyright}`;

    return this.sendEmail({ to: data.to, subject: t.passwordReset.subject, html, text });
  }

  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const copyright = t.common.copyright.replace('{year}', new Date().getFullYear().toString());
    const dateFormatted = new Date(data.timestamp).toLocaleString(this.getLocale(data.language));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"><h1>✓ ${t.passwordChanged.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.passwordChanged.intro}</p><div class="success"><ul style="margin:10px 0;padding-left:20px"><li><strong>Date:</strong> ${dateFormatted}</li><li><strong>IP:</strong> ${data.ipAddress}</li><li><strong>Location:</strong> ${data.location}</li></ul></div><div class="warning"><strong>⚠️</strong> ${t.passwordChanged.warning}</div><p>${t.common.footer}</p></div><div class="footer"><p>${copyright}</p></div></div></body></html>`;
    const text = `${t.passwordChanged.title}\n\n${t.common.greeting} ${data.name},\n\n${t.passwordChanged.intro}\n\nDate: ${dateFormatted}\nIP: ${data.ipAddress}\nLocation: ${data.location}\n\n${t.passwordChanged.warning}\n\n${t.common.footer}\n\n${copyright}`;

    return this.sendEmail({ to: data.to, subject: t.passwordChanged.subject, html, text });
  }

  async sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const copyright = t.common.copyright.replace('{year}', new Date().getFullYear().toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)"><h1>🚨 ${t.securityAlert.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><div class="warning"><strong>${data.alertType}</strong><br>${data.details}</div><p><strong>${t.securityAlert.actions}</strong></p><ul><li>${t.securityAlert.action1}</li><li>${t.securityAlert.action2}</li><li>${t.securityAlert.action3}</li></ul><p>${t.common.footer}</p></div><div class="footer"><p>${copyright}</p></div></div></body></html>`;
    const text = `🚨 ${t.securityAlert.title}\n\n${t.common.greeting} ${data.name},\n\n${data.alertType}\n${data.details}\n\n${t.securityAlert.actions}\n- ${t.securityAlert.action1}\n- ${t.securityAlert.action2}\n- ${t.securityAlert.action3}\n\n${t.common.footer}\n\n${copyright}`;

    return this.sendEmail({ to: data.to, subject: t.securityAlert.subject, html, text });
  }

  async sendMagicLinkEmail(data: MagicLinkEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const copyright = `© ${new Date().getFullYear()} Meeshy. All rights reserved.`;
    const dateFormatted = new Date().toLocaleString(this.getLocale(lang));

    const content = this.getMagicLinkTranslations(lang);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.subject}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5">
  <div class="container" style="max-width:600px;margin:0 auto;padding:20px">
    <!-- Header with Logo -->
    <div class="header" style="background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">🔐 ${content.title}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${content.subtitle}</p>
    </div>

    <!-- Main Content -->
    <div class="content" style="background:#ffffff;padding:40px 30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
      <p style="font-size:16px;color:#374151">${content.greeting} <strong style="color:#6366F1">${data.name}</strong>,</p>
      <p style="font-size:16px;color:#374151;line-height:1.6">${content.intro}</p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:30px 0">
        <a href="${data.magicLink}" class="button" style="display:inline-block;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);color:white;padding:16px 40px;text-decoration:none;border-radius:10px;font-weight:bold;font-size:18px;box-shadow:0 4px 14px rgba(99,102,241,0.4)">
          ✨ ${content.buttonText}
        </a>
      </div>

      <!-- Warning Box -->
      <div class="warning" style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:25px 0;border-radius:0 8px 8px 0">
        <strong style="color:#dc2626">⏰ ${content.expiryTitle}</strong>
        <p style="margin:8px 0 0;color:#7f1d1d;font-size:14px">${content.expiryText}</p>
      </div>

      <!-- Security Info Box -->
      <div class="info" style="background:#EEF2FF;border-left:4px solid #6366F1;padding:16px;margin:20px 0;border-radius:0 8px 8px 0">
        <p style="margin:0;font-size:14px;color:#4338ca">
          <strong>📍 ${content.requestFrom}</strong> ${data.location}<br>
          <strong>🕐 ${content.requestAt}</strong> ${dateFormatted}
        </p>
      </div>

      <!-- Fallback Link -->
      <p style="color:#6b7280;font-size:12px;word-break:break-all;margin-top:20px">
        ${content.fallbackText}<br>
        <a href="${data.magicLink}" style="color:#6366F1">${data.magicLink}</a>
      </p>

      <!-- Security Note -->
      <p style="color:#9ca3af;font-size:13px;margin-top:25px;padding-top:20px;border-top:1px solid #e5e7eb">
        ${content.notYou}
      </p>

      <p style="color:#374151;font-size:14px;margin-top:20px">${content.footer}</p>
    </div>

    <!-- Footer -->
    <div class="footer" style="margin-top:30px;padding:20px;text-align:center">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      <p style="font-size:12px;color:#9ca3af;margin:15px 0 0">${copyright}</p>
      <p style="font-size:11px;color:#d1d5db;margin:10px 0 0">
        <a href="${this.frontendUrl}/privacy" style="color:#9ca3af;text-decoration:none">${content.privacy}</a> •
        <a href="${this.frontendUrl}/terms" style="color:#9ca3af;text-decoration:none">${content.terms}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro}\n\n${data.magicLink}\n\n${content.expiryTitle}: ${content.expiryText}\n\n${content.requestFrom} ${data.location}\n${content.requestAt} ${dateFormatted}\n\n${content.notYou}\n\n${content.footer}\n\n${copyright}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text });
  }

  private getMagicLinkTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: '🔐 Votre lien de connexion Meeshy',
        title: 'Connexion Meeshy',
        subtitle: 'Connexion sécurisée en un clic',
        greeting: 'Bonjour',
        intro: 'Cliquez sur le bouton ci-dessous pour vous connecter instantanément à votre compte Meeshy. Ce lien est valide pendant 1 minute seulement.',
        buttonText: 'Se connecter',
        expiryTitle: 'Lien à usage unique',
        expiryText: 'Ce lien expire dans 1 minute et ne peut être utilisé qu\'une seule fois. Pour votre sécurité, ne le partagez avec personne.',
        requestFrom: 'Demande depuis:',
        requestAt: 'Demandé le:',
        fallbackText: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur:',
        notYou: 'Si vous n\'avez pas demandé ce lien, vous pouvez ignorer cet email en toute sécurité. Votre compte reste protégé.',
        footer: 'L\'équipe Meeshy',
        privacy: 'Confidentialité',
        terms: 'Conditions'
      },
      en: {
        subject: '🔐 Your Meeshy login link',
        title: 'Meeshy Login',
        subtitle: 'Secure one-click sign in',
        greeting: 'Hello',
        intro: 'Click the button below to instantly sign in to your Meeshy account. This link is valid for 1 minute only.',
        buttonText: 'Sign in',
        expiryTitle: 'One-time use link',
        expiryText: 'This link expires in 1 minute and can only be used once. For your security, do not share it with anyone.',
        requestFrom: 'Request from:',
        requestAt: 'Requested at:',
        fallbackText: 'If the button doesn\'t work, copy and paste this link into your browser:',
        notYou: 'If you did not request this link, you can safely ignore this email. Your account remains protected.',
        footer: 'The Meeshy Team',
        privacy: 'Privacy',
        terms: 'Terms'
      },
      es: {
        subject: '🔐 Tu enlace de inicio de sesión de Meeshy',
        title: 'Inicio de sesión en Meeshy',
        subtitle: 'Inicio de sesión seguro con un clic',
        greeting: 'Hola',
        intro: 'Haz clic en el botón de abajo para iniciar sesión instantáneamente en tu cuenta Meeshy. Este enlace es válido solo por 1 minuto.',
        buttonText: 'Iniciar sesión',
        expiryTitle: 'Enlace de un solo uso',
        expiryText: 'Este enlace expira en 1 minuto y solo puede usarse una vez. Por tu seguridad, no lo compartas con nadie.',
        requestFrom: 'Solicitud desde:',
        requestAt: 'Solicitado el:',
        fallbackText: 'Si el botón no funciona, copia y pega este enlace en tu navegador:',
        notYou: 'Si no solicitaste este enlace, puedes ignorar este correo con seguridad. Tu cuenta permanece protegida.',
        footer: 'El equipo de Meeshy',
        privacy: 'Privacidad',
        terms: 'Términos'
      },
      pt: {
        subject: '🔐 Seu link de login Meeshy',
        title: 'Login Meeshy',
        subtitle: 'Login seguro com um clique',
        greeting: 'Olá',
        intro: 'Clique no botão abaixo para entrar instantaneamente na sua conta Meeshy. Este link é válido por apenas 1 minuto.',
        buttonText: 'Entrar',
        expiryTitle: 'Link de uso único',
        expiryText: 'Este link expira em 1 minuto e só pode ser usado uma vez. Para sua segurança, não compartilhe com ninguém.',
        requestFrom: 'Solicitação de:',
        requestAt: 'Solicitado em:',
        fallbackText: 'Se o botão não funcionar, copie e cole este link no seu navegador:',
        notYou: 'Se você não solicitou este link, pode ignorar este e-mail com segurança. Sua conta permanece protegida.',
        footer: 'A equipe Meeshy',
        privacy: 'Privacidade',
        terms: 'Termos'
      }
    };
    return translations[language] || translations['en'];
  }
}
