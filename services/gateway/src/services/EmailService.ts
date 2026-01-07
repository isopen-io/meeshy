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

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@meeshy.me';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Meeshy';
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
    if (this.providers.length === 0) {
      console.warn('[EmailService] No providers configured - email not sent to:', to);
      return { success: false, error: 'No email providers configured' };
    }

    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        console.log(`[EmailService] Trying provider: ${provider.name}`);
        let result: EmailResult;
        switch (provider.name) {
          case 'brevo': result = await this.sendViaBrevo(provider.apiKey, data); break;
          case 'sendgrid': result = await this.sendViaSendGrid(provider.apiKey, data); break;
          case 'mailgun': result = await this.sendViaMailgun(provider.apiKey, data); break;
          default: continue;
        }
        if (result.success) {
          console.log(`[EmailService] ✅ Email sent via ${provider.name} to:`, to);
          return { ...result, provider: provider.name };
        }
        errors.push(`${provider.name}: ${result.error}`);
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    console.error('[EmailService] All providers failed for:', to);
    return { success: false, error: `All providers failed: ${errors.join('; ')}` };
  }

  private async sendViaBrevo(apiKey: string, data: EmailData): Promise<EmailResult> {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: this.fromName, email: this.fromEmail },
      to: [{ email: data.to }],
      subject: data.subject,
      htmlContent: data.html,
      textContent: data.text
    }, {
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' }
    });
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
}
