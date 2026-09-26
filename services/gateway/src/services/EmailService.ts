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

import crypto from 'crypto';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../utils/logger-enhanced';
import {
  getAccountDeletionConfirmTranslations,
  getAccountDeletionReminderTranslations,
  getAlertTypeLabel,
  getDigestTranslations,
  getMagicLinkTranslations,
  translations,
  type EmailTranslations,
  type SupportedLanguage,
} from './email/translations';
import {
  accountIdentityBlockHtml,
  accountIdentityBlockText,
  type IdentiteDuCompte,
} from './email/account-identity-block';
import { composePasswordResetEmail, type PasswordResetEmailData } from './email/password-reset-email';
import { composeLoginCodeEmail, codeExpiryText, type LoginCodeEmailData } from './email/login-code-email';
import { isStagingEnvironment, markForEnvironment } from './email/staging-marker';
import { sendViaBrevo, sendViaMailgun, sendViaSendGrid, type EmailSender } from './email/providers';

// Logger dédié pour EmailService
const logger = enhancedLogger.child({ module: 'EmailService' });

/**
 * Les TABLES vivent dans `./email/translations` depuis #6424 — ce fichier
 * COMPOSE et ENVOIE, il ne DIT plus. Voir le doc-comment de ce module pour la
 * raison du découpage : 1842 lignes pour un plafond dur de 1200.
 */


// ============================================================================
// INTERFACES
// ============================================================================

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text: string;
  trackingType?: string;
  trackingLang?: string;
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

export type { PasswordEmailIntent, PasswordResetEmailData } from './email/password-reset-email';

export interface EmailVerificationData {
  to: string;
  name: string;
  verificationLink: string;
  verificationCode?: string;
  expiryHours: number;
  /** Posé pour une paire de moins d'une heure (#8033) : « expire dans N minutes ». */
  expiryMinutes?: number;
  language?: string;
  /**
   * L'identité DÉRIVÉE et ses liens d'édition (#6424).
   *
   * OPTIONNELLE parce que tous les appelants ne l'ont pas — le renvoi de
   * vérification depuis un chemin qui ne charge pas le profil, par exemple.
   * Absente, le bloc n'est simplement pas composé : jamais un bloc à moitié
   * rempli, qui présenterait un pseudo vide comme si c'était le sien.
   */
  identity?: IdentiteDuCompte;
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

/**
 * Social / general notification email (mention, missed call, …) sent to an
 * offline user. Rendered as a neutral informational message (never the red
 * security-alert styling) and tracked separately from security alerts.
 */
export interface NotificationEmailData {
  to: string;
  name: string;
  notificationType: string;
  details: string;
  language?: string;
}

export interface LoginAlertEmailData {
  to: string;
  name: string;
  language?: string;
  deviceName: string | null;
  deviceOS: string | null;
  appOrBrowser: string | null;
  location: string | null;
  ip: string | null;
  loginTime: Date;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  previousDeviceName: string | null;
  previousLocation: string | null;
  previousLoginTime: Date | null;
  revokeAllUrl: string;
}

export interface MagicLinkEmailData {
  to: string;
  name: string;
  magicLink: string;
  location: string;
  language?: string;
  /**
   * L'identité et ses liens (#6424) — servie ici pour une raison propre au
   * lien magique : tant qu'aucun mot de passe n'est posé, cet e-mail est la
   * SEULE porte du compte. C'est donc le seul endroit où rappeler qu'on peut
   * cesser d'en dépendre.
   *
   * Quand `identity.hasPassword` est vrai, le bloc se réduit à l'identité et
   * à son lien d'édition : le paragraphe « définir un mot de passe » ne
   * s'affiche pas.
   */
  identity?: IdentiteDuCompte;
}

export interface EmailChangeVerificationData {
  to: string;
  name: string;
  verificationLink: string;
  expiryHours: number;
  language?: string;
}

export interface NotificationDigestEmailData {
  to: string;
  name: string;
  language: string;
  unreadCount: number;
  /**
   * One-click magic-login URL that authenticates the user and deep-links into
   * the app (see MagicLinkService.issueLoginTokenForUser + the digest job).
   * This is the sole CTA — the teaser intentionally reveals counts only.
   */
  magicUrl: string;
  settingsUrl: string;
}

export interface BroadcastEmailData {
  to: string;
  recipientName: string;
  subject: string;
  body: string;
  language: string;
  unsubscribeUrl: string;
}



export interface InvitationEmailData {
  to: string;
  senderName: string;
  senderAvatar?: string | null;
  downloadUrl: string;
  language?: string;
}

export interface AccountDeletionConfirmEmailData {
  to: string;
  name: string;
  confirmLink: string;
  cancelLink: string;
  language?: string;
}

export interface AccountDeletionReminderEmailData {
  to: string;
  name: string;
  deleteNowLink: string;
  cancelLink: string;
  gracePeriodEndDate: string;
  language?: string;
}


// ============================================================================
// I18N TRANSLATIONS
// ============================================================================


// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

export class EmailService {
  private providers: EmailProviderConfig[] = [];
  private fromEmail: string;
  private fromName: string;
  private defaultLanguage: SupportedLanguage = 'en';
  private brandLogoUrl: string;
  private frontendUrl: string;
  /** `MEESHY_ENV=staging`, lu UNE fois (#8036) — voir `./email/staging-marker`. */
  private readonly staging: boolean;

  constructor() {
    this.staging = isStagingEnvironment(process.env.MEESHY_ENV);
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@meeshy.me';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Meeshy';
    this.frontendUrl = process.env.FRONTEND_URL || 'https://meeshy.me';
    // Use the app icon from the frontend public folder (deployed with the web app)
    // This is the same icon used for PWA and mobile bookmarks (android-chrome-512x512.png)
    this.brandLogoUrl = process.env.BRAND_LOGO_URL || `${this.frontendUrl}/android-chrome-512x512.png`;
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
  }

  private getTranslations(language?: string): EmailTranslations {
    const lang = this.normalizeLanguage(language);
    return translations[lang] || translations[this.defaultLanguage];
  }

  private normalizeLanguage(language?: string): SupportedLanguage {
    if (!language) return this.defaultLanguage;
    // Réduction 639-2/639-3 → 639-1 + BCP-47 via le SSOT partagé (jamais une
    // troncature aveugle : `'spa'` → `'es'`, `'por'` → `'pt'`, PAS `'sp'`/`'po'`).
    const normalized = normalizeLanguageCode(language);
    const supported: SupportedLanguage[] = ['fr', 'en', 'es', 'pt', 'it', 'de'];
    return normalized && supported.includes(normalized as SupportedLanguage)
      ? (normalized as SupportedLanguage)
      : this.defaultLanguage;
  }

  private getLocale(language?: string): string {
    const lang = this.normalizeLanguage(language);
    const locales: Record<SupportedLanguage, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR', it: 'it-IT', de: 'de-DE' };
    return locales[lang];
  }

  private getSlogan(lang?: string): string {
    const normalized = this.normalizeLanguage(lang);
    const slogans: Record<SupportedLanguage, string> = {
      fr: 'Fais avec \u2764\ufe0f par Services.ceo pour - Briser les barri\u00e8res linguistiques, une conversation \u00e0 la fois',
      en: 'Made with \u2764\ufe0f by Services.ceo to - Break language barriers, one conversation at a time',
      es: 'Hecho con \u2764\ufe0f por Services.ceo para - Romper las barreras ling\u00fc\u00edsticas, una conversaci\u00f3n a la vez',
      pt: 'Feito com \u2764\ufe0f pela Services.ceo para - Quebrar as barreiras lingu\u00edsticas, uma conversa de cada vez',
      it: 'Fatto con \u2764\ufe0f da Services.ceo per - Abbattere le barriere linguistiche, una conversazione alla volta',
      de: 'Gemacht mit \u2764\ufe0f von Services.ceo f\u00fcr - Sprachbarrieren \u00fcberwinden, ein Gespr\u00e4ch nach dem anderen',
    };
    return slogans[normalized];
  }

  private getFooterContentHtml(lang?: string): string {
    const normalized = this.normalizeLanguage(lang);
    const year = new Date().getFullYear().toString();
    const copyright = translations[normalized].common.copyright.replace('{year}', year);
    const copyrightWithLink = copyright.replace(
      'Meeshy.',
      `<a href="${this.frontendUrl}" style="color:inherit;text-decoration:underline">Meeshy</a>.`
    );
    const slogan = this.getSlogan(normalized);
    return `<p style="font-size:11px;color:#9ca3af;margin:15px 0 5px;font-style:italic">${slogan}</p><p style="margin:0">${copyrightWithLink}</p>`;
  }

  private getFooterContentText(lang?: string): string {
    const normalized = this.normalizeLanguage(lang);
    const year = new Date().getFullYear().toString();
    const copyright = translations[normalized].common.copyright.replace('{year}', year);
    const slogan = this.getSlogan(normalized);
    return `${slogan}\n\n${copyright}`;
  }

  private getTrackingPixelHtml(emailType: string, lang?: string): string {
    const id = crypto.randomUUID();
    const params = new URLSearchParams({
      id,
      object: emailType,
      date: new Date().toISOString(),
    });
    if (lang) params.set('lang', lang);
    return `<img src="${this.frontendUrl}/l/meeshy-emails?${params.toString()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  }

  private sender(): EmailSender {
    return { name: this.fromName, email: this.fromEmail };
  }

  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  private async sendEmail(input: EmailData): Promise<EmailResult> {
    const data = markForEnvironment({ ...input }, this.staging);
    if (data.trackingType) {
      const pixel = this.getTrackingPixelHtml(data.trackingType, data.trackingLang);
      data.html = data.html.replace('</body>', `${pixel}\n</body>`);
    }

    const { to } = data;

    if (this.providers.length === 0) {
      logger.warn(`[EmailService] ❌ No providers configured - email not sent to to=${to}`);
      return { success: false, error: 'No email providers configured' };
    }

    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        logger.info(`[EmailService] 🔄 Trying provider: ${provider.name}`);
        let result: EmailResult;
        switch (provider.name) {
          case 'brevo': result = await sendViaBrevo(provider.apiKey, this.sender(), data); break;
          case 'sendgrid': result = await sendViaSendGrid(provider.apiKey, this.sender(), data); break;
          case 'mailgun': result = await sendViaMailgun(provider.apiKey, this.sender(), data); break;
          default: continue;
        }
        if (result.success) {
          logger.info(`[EmailService] ✅ Email sent successfully via ${provider.name}`);
          logger.info(`[EmailService] ✅ Recipient: ${to}`);
          logger.info(`[EmailService] ✅ Message ID: ${result.messageId || 'N/A'}`);
          return { ...result, provider: provider.name };
        }
        logger.warn(`[EmailService] ⚠️ Provider ${provider.name} failed: ${result.error}`);
        errors.push(`${provider.name}: ${result.error}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[EmailService] ❌ Provider ${provider.name} threw exception: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
          logger.error(`[EmailService] Stack trace: ${error.stack}`);
        }
        errors.push(`${provider.name}: ${errorMsg}`);
      }
    }
    logger.error('[EmailService] ❌ All providers failed for', to);
    logger.error('[EmailService] ❌ Errors', errors.join(' | '));
    return { success: false, error: `All providers failed: ${errors.join('; ')}` };
  }

  // ==========================================================================
  // EMAIL TEMPLATES (i18n)
  // ==========================================================================

  private getBaseStyles(): string {
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

  async sendEmailVerification(data: EmailVerificationData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = data.expiryMinutes !== undefined
      ? codeExpiryText(data.language, data.expiryMinutes)
      : t.verification.expiry.replace('{hours}', data.expiryHours.toString());

    const codeBlockHtml = data.verificationCode
      ? `<div style="text-align:center;margin:20px 0"><p style="font-size:14px;color:#666;margin-bottom:8px">${data.language === 'fr' ? 'Ou entrez ce code dans l\'application' : 'Or enter this code in the app'}:</p><div style="display:inline-block;padding:12px 24px;background:#f4f4f5;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace;color:#1e1b4b">${data.verificationCode}</div></div>`
      : '';
    const codeBlockText = data.verificationCode
      ? `\n\n${data.language === 'fr' ? 'Ou entrez ce code dans l\'application' : 'Or enter this code in the app'}: ${data.verificationCode}`
      : '';

    // #6424 — l'identité DÉRIVÉE se découvre ici, ou nulle part : une
    // inscription par e-mail seul n'a montré ni pseudo ni nom affiché à qui
    // s'inscrit. Le bloc se place APRÈS le bouton de validation et AVANT les
    // mentions d'expiration : le geste demandé reste le premier lu.
    const identityHtml = data.identity ? accountIdentityBlockHtml(data.identity, data.language) : '';
    const identityText = data.identity ? `\n\n${accountIdentityBlockText(data.identity, data.language)}` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>🎉 ${t.verification.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.verification.intro}</p><div style="text-align:center"><a href="${data.verificationLink}" class="button">✓ ${t.verification.buttonText}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${data.verificationLink}</p>${codeBlockHtml}${identityHtml}<div class="info"><strong>ℹ️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.verification.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.verification.title}\n\n${t.common.greeting} ${data.name},\n\n${t.verification.intro}\n\n${data.verificationLink}${codeBlockText}${identityText}\n\n${expiry}\n\n${t.verification.ignoreNote}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.verification.subject, html, text, trackingType: 'verification', trackingLang: data.language });
  }

  /** Code de CONNEXION + lien, pour un compte déjà vérifié (#8033). */
  async sendLoginCodeEmail(data: LoginCodeEmailData): Promise<EmailResult> {
    const { subject, html, text } = composeLoginCodeEmail(data, {
      styles: this.getBaseStyles(),
      footerHtml: this.getFooterContentHtml(data.language),
      footerText: this.getFooterContentText(data.language),
    });
    return this.sendEmail({ to: data.to, subject, html, text, trackingType: 'login_code', trackingLang: data.language });
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    const { subject, html, text } = composePasswordResetEmail(data, {
      translations: this.getTranslations(data.language),
      baseStyles: this.getBaseStyles(),
      footerHtml: this.getFooterContentHtml(data.language),
      footerText: this.getFooterContentText(data.language),
    });
    return this.sendEmail({ to: data.to, subject, html, text, trackingType: 'password_reset', trackingLang: data.language });
  }

  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const dateFormatted = new Date(data.timestamp).toLocaleString(this.getLocale(data.language));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"><h1>✓ ${t.passwordChanged.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.passwordChanged.intro}</p><div class="success"><ul style="margin:10px 0;padding-left:20px"><li><strong>Date:</strong> ${dateFormatted}</li><li><strong>IP:</strong> ${data.ipAddress}</li><li><strong>Location:</strong> ${data.location}</li></ul></div><div class="warning"><strong>⚠️</strong> ${t.passwordChanged.warning}</div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.passwordChanged.title}\n\n${t.common.greeting} ${data.name},\n\n${t.passwordChanged.intro}\n\nDate: ${dateFormatted}\nIP: ${data.ipAddress}\nLocation: ${data.location}\n\n${t.passwordChanged.warning}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.passwordChanged.subject, html, text, trackingType: 'password_changed', trackingLang: data.language });
  }


  /**
   * Shared renderer for label-driven emails (security alerts AND social/general
   * notifications). `alert.isInfo` drives neutral (indigo info box) vs. alarming
   * (red warning box + recommended-actions list) styling. `trackingType`
   * distinguishes the two families for analytics.
   */
  private composeLabeledEmail(
    data: { to: string; name: string; details: string; language?: string },
    alert: { label: string; description: string; icon: string; isInfo: boolean },
    trackingType: string,
  ): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const details = data.details && data.details.length > 0 ? data.details : alert.description;
    const headerBg = alert.isInfo ? 'background:linear-gradient(135deg,#6366F1 0%,#4338CA 100%)' : 'background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)';
    const headerTitle = alert.isInfo ? `${alert.icon} ${alert.label}` : `🚨 ${t.securityAlert.title}`;
    const subject = alert.isInfo ? `${alert.label} - Meeshy` : t.securityAlert.subject;

    const actionsHtml = alert.isInfo
      ? ''
      : `<p><strong>${t.securityAlert.actions}</strong></p><ul><li>${t.securityAlert.action1}</li><li>${t.securityAlert.action2}</li><li>${t.securityAlert.action3}</li></ul>`;
    const actionsText = alert.isInfo
      ? ''
      : `\n\n${t.securityAlert.actions}\n- ${t.securityAlert.action1}\n- ${t.securityAlert.action2}\n- ${t.securityAlert.action3}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="${headerBg}"><h1>${headerTitle}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><div class="${alert.isInfo ? 'info' : 'warning'}"><strong>${alert.label}</strong><br>${details}</div>${actionsHtml}<p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${alert.icon} ${alert.label}\n\n${t.common.greeting} ${data.name},\n\n${details}${actionsText}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject, html, text, trackingType, trackingLang: data.language });
  }

  async sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<EmailResult> {
    return this.composeLabeledEmail(data, getAlertTypeLabel(data.alertType, data.language), 'security_alert');
  }

  /**
   * Social / general notification email (mention, missed call, …). Always
   * informational — never the red security-alert styling — and tracked as
   * 'notification' so it is never conflated with account-security alerts.
   */
  async sendNotificationEmail(data: NotificationEmailData): Promise<EmailResult> {
    const label = getAlertTypeLabel(data.notificationType, data.language);
    return this.composeLabeledEmail(data, { ...label, isInfo: true }, 'notification');
  }

  async sendLoginAlertEmail(data: LoginAlertEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const locale = this.getLocale(data.language);
    const la = t.loginAlert;

    const timeFormatted = data.loginTime.toLocaleString(locale, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: data.timezone || 'UTC',
    });
    const tzLabel = data.timezone || 'UTC';

    const prevTimeFormatted = data.previousLoginTime
      ? data.previousLoginTime.toLocaleString(locale, {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: data.timezone || 'UTC',
        })
      : null;

    const mapUrl = data.latitude != null && data.longitude != null
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${data.latitude},${data.longitude}&zoom=10&size=300x150&markers=${data.latitude},${data.longitude},red-pushpin`
      : null;

    const detailRow = (icon: string, label: string, value: string | null) =>
      value ? `<tr><td style="padding:6px 12px;color:#6b7280;white-space:nowrap;vertical-align:top">${icon} ${label}</td><td style="padding:6px 12px;font-weight:600">${value}</td></tr>` : '';

    const detailsHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0">${detailRow('&#128241;', la.deviceLabel, [data.deviceName, data.deviceOS].filter(Boolean).join(' &middot; '))}${detailRow('&#127760;', la.appLabel, data.appOrBrowser)}${detailRow('&#128205;', la.locationLabel, data.location)}${detailRow('&#127758;', la.ipLabel, data.ip)}${detailRow('&#128336;', la.timeLabel, `${timeFormatted} (${tzLabel})`)}</table>`;

    const mapHtml = mapUrl
      ? `<div style="margin:16px 0;text-align:center"><img src="${mapUrl}" alt="${la.mapAlt} — ${data.location || ''}" style="border-radius:8px;max-width:100%;height:auto" width="300" height="150"></div>`
      : '';

    const previousHtml = prevTimeFormatted
      ? `<div style="border-top:1px dashed #d1d5db;margin:20px 0;padding-top:16px"><p style="font-size:13px;color:#6b7280;margin:0 0 8px;font-weight:600">${la.previousTitle}</p><table style="width:100%;border-collapse:collapse">${detailRow('&#128241;', la.deviceLabel, data.previousDeviceName)}${detailRow('&#128205;', la.locationLabel, data.previousLocation)}${detailRow('&#128336;', la.timeLabel, prevTimeFormatted)}</table></div>`
      : '';

    const revokeHtml = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:24px 0;text-align:center"><p style="font-weight:600;color:#991b1b;margin:0 0 12px">&#9888;&#65039; ${la.revokeTitle}</p><a href="${data.revokeAllUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px">${la.revokeButton}</a><p style="font-size:12px;color:#6b7280;margin:12px 0 0">${la.revokeExpiry}</p></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#6366F1 0%,#4338CA 100%)"><h1>&#128274; ${la.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${la.intro}</p>${detailsHtml}${mapHtml}${previousHtml}${revokeHtml}<p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;

    const detailText = (label: string, value: string | null) =>
      value ? `  ${label}: ${value}\n` : '';
    const text = [
      `${la.title}\n`,
      `${t.common.greeting} ${data.name},\n`,
      la.intro, '\n',
      detailText(la.deviceLabel, [data.deviceName, data.deviceOS].filter(Boolean).join(' - ')),
      detailText(la.appLabel, data.appOrBrowser),
      detailText(la.locationLabel, data.location),
      detailText(la.ipLabel, data.ip),
      detailText(la.timeLabel, `${timeFormatted} (${tzLabel})`),
      prevTimeFormatted ? `\n--- ${la.previousTitle} ---\n${detailText(la.deviceLabel, data.previousDeviceName)}${detailText(la.locationLabel, data.previousLocation)}${detailText(la.timeLabel, prevTimeFormatted)}` : '',
      `\n${la.revokeTitle}\n${data.revokeAllUrl}\n${la.revokeExpiry}\n`,
      `\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`,
    ].join('');

    return this.sendEmail({ to: data.to, subject: la.subject, html, text, trackingType: 'login_alert', trackingLang: data.language });
  }

  async sendEmailChangeVerification(data: EmailChangeVerificationData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = t.emailChange.expiry.replace('{hours}', data.expiryHours.toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>📧 ${t.emailChange.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.emailChange.intro}</p><div style="text-align:center"><a href="${data.verificationLink}" class="button">✓ ${t.emailChange.buttonText}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${data.verificationLink}</p><div class="warning"><strong>⚠️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.emailChange.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.emailChange.title}\n\n${t.common.greeting} ${data.name},\n\n${t.emailChange.intro}\n\n${data.verificationLink}\n\n${expiry}\n\n${t.emailChange.ignoreNote}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.emailChange.subject, html, text, trackingType: 'email_change', trackingLang: data.language });
  }



  async sendInvitationEmail(data: InvitationEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const avatarHtml = data.senderAvatar
      ? `<img src="${data.senderAvatar}" alt="${this.escapeHtml(data.senderName)}" style="width:64px;height:64px;border-radius:50%;margin-bottom:10px" onerror="this.style.display='none'">`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>💬 ${this.escapeHtml(data.senderName)} vous invite sur Meeshy !</h1></div><div class="content"><div style="text-align:center;margin:20px 0">${avatarHtml}<p style="font-size:16px"><strong>${this.escapeHtml(data.senderName)}</strong> vous invite a rejoindre Meeshy, la plateforme de messagerie multilingue.</p><p style="font-size:14px;color:#666">Communiquez sans barrieres linguistiques avec la traduction automatique en temps reel.</p></div><div style="text-align:center"><a href="${data.downloadUrl}" class="button">Rejoindre Meeshy</a></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${data.senderName} vous invite sur Meeshy !\n\nRejoignez la plateforme de messagerie multilingue.\n\nRejoindre : ${data.downloadUrl}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: `${data.senderName} vous invite sur Meeshy`, html, text, trackingType: 'invitation', trackingLang: data.language });
  }

  async sendMagicLinkEmail(data: MagicLinkEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const dateFormatted = new Date().toLocaleString(this.getLocale(lang));

    const content = getMagicLinkTranslations(lang);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${content.subject}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <!-- Header with Logo -->
    <div class="header" style="border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${content.title}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${content.subtitle}</p>
    </div>

    <!-- Main Content -->
    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${content.greeting} <strong class="link-text">${data.name}</strong>,</p>
      <p>${content.intro}</p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:30px 0">
        <a href="${data.magicLink}" class="button" style="font-size:18px;padding:16px 40px">
          ✨ ${content.buttonText}
        </a>
      </div>

      <!-- Warning Box -->
      <div class="warning">
        <strong>⏰ ${content.expiryTitle}</strong>
        <p style="margin:8px 0 0;font-size:14px">${content.expiryText}</p>
      </div>

      <!-- Security Info Box -->
      <div class="info">
        <p style="margin:0;font-size:14px">
          <strong>📍 ${content.requestFrom}</strong> ${data.location}<br>
          <strong>🕐 ${content.requestAt}</strong> ${dateFormatted}
        </p>
      </div>

      ${data.identity ? accountIdentityBlockHtml(data.identity, lang) : ''}

      <!-- Fallback Link -->
      <p style="font-size:12px;word-break:break-all;margin-top:20px">
        ${content.fallbackText}<br>
        <a href="${data.magicLink}" class="link-text">${data.magicLink}</a>
      </p>

      <!-- Security Note -->
      <p style="font-size:13px;margin-top:25px;padding-top:20px">
        ${content.notYou}
      </p>

      <p style="font-size:14px;margin-top:20px">${content.footer}</p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
      <p style="font-size:11px;margin:10px 0 0">
        <a href="${this.frontendUrl}/privacy" class="link-text" style="text-decoration:none">${content.privacy}</a> •
        <a href="${this.frontendUrl}/terms" class="link-text" style="text-decoration:none">${content.terms}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
    const identityText = data.identity ? `\n\n${accountIdentityBlockText(data.identity, lang)}` : '';
    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro}\n\n${data.magicLink}${identityText}\n\n${content.expiryTitle}: ${content.expiryText}\n\n${content.requestFrom} ${data.location}\n${content.requestAt} ${dateFormatted}\n\n${content.notYou}\n\n${content.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text, trackingType: 'magic_link', trackingLang: lang });
  }


  // ==========================================================================
  // ACCOUNT DELETION EMAILS
  // ==========================================================================

  async sendAccountDeletionConfirmEmail(data: AccountDeletionConfirmEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const content = getAccountDeletionConfirmTranslations(lang);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${content.subject}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${content.title}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${content.subtitle}</p>
    </div>

    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${content.greeting} <strong class="link-text">${this.escapeHtml(data.name)}</strong>,</p>
      <p>${content.intro}</p>

      <div class="warning">
        <strong>${content.warningTitle}</strong>
        <p style="margin:8px 0 0;font-size:14px">${content.warningText}</p>
      </div>

      <div class="info">
        <strong>${content.gracePeriodTitle}</strong>
        <p style="margin:8px 0 0;font-size:14px">${content.gracePeriodText}</p>
      </div>

      <div style="text-align:center;margin:30px 0">
        <a href="${data.confirmLink}" style="display:inline-block;background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);color:white!important;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px">
          ${content.confirmButton}
        </a>
      </div>

      <div style="text-align:center;margin:10px 0 30px">
        <a href="${data.cancelLink}" style="display:inline-block;background:#6b7280;color:white!important;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">
          ${content.cancelButton}
        </a>
      </div>

      <p style="font-size:13px;margin-top:25px;padding-top:20px">
        ${content.notYou}
      </p>

      <p style="font-size:14px;margin-top:20px">${content.footer}</p>
    </div>

    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
    </div>
  </div>
</body>
</html>`;
    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro}\n\n${content.warningTitle}: ${content.warningText}\n\n${content.gracePeriodTitle}: ${content.gracePeriodText}\n\n${content.confirmButton}: ${data.confirmLink}\n${content.cancelButton}: ${data.cancelLink}\n\n${content.notYou}\n\n${content.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text, trackingType: 'deletion_confirm', trackingLang: lang });
  }

  async sendAccountDeletionReminderEmail(data: AccountDeletionReminderEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const content = getAccountDeletionReminderTranslations(lang);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${content.subject}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${content.title}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${content.subtitle}</p>
    </div>

    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${content.greeting} <strong class="link-text">${this.escapeHtml(data.name)}</strong>,</p>
      <p>${content.intro.replace('{date}', data.gracePeriodEndDate)}</p>

      <div class="warning">
        <strong>${content.reminderTitle}</strong>
        <p style="margin:8px 0 0;font-size:14px">${content.reminderText}</p>
      </div>

      <div style="text-align:center;margin:30px 0">
        <a href="${data.cancelLink}" style="display:inline-block;background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:white!important;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px">
          ${content.cancelButton}
        </a>
      </div>

      <div style="text-align:center;margin:10px 0 30px">
        <a href="${data.deleteNowLink}" style="display:inline-block;background:#dc2626;color:white!important;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">
          ${content.deleteNowButton}
        </a>
      </div>

      <p style="font-size:13px;margin-top:25px;padding-top:20px">
        ${content.cancelNote}
      </p>

      <p style="font-size:14px;margin-top:20px">${content.footer}</p>
    </div>

    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
    </div>
  </div>
</body>
</html>`;
    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro.replace('{date}', data.gracePeriodEndDate)}\n\n${content.reminderTitle}: ${content.reminderText}\n\n${content.cancelButton}: ${data.cancelLink}\n${content.deleteNowButton}: ${data.deleteNowLink}\n\n${content.cancelNote}\n\n${content.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text, trackingType: 'deletion_reminder', trackingLang: lang });
  }





  // ==========================================================================
  // NOTIFICATION DIGEST EMAIL
  // ==========================================================================

  async sendNotificationDigestEmail(data: NotificationDigestEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const t = getDigestTranslations(lang);

    // Re-engagement teaser: reveal the aggregate unread count ONLY (no actor
    // names, no message previews) to create curiosity and avoid leaking content
    // if the email is forwarded. The single CTA is a one-click magic-login link.
    const fill = (s: string) => s.replace('{count}', data.unreadCount.toString());

    const countText = fill(t.unreadTitle);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${fill(t.subject)}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${countText}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${t.subtitle}</p>
    </div>

    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${t.greeting} <strong class="link-text">${this.escapeHtml(data.name)}</strong>,</p>
      <p>${fill(t.teaserIntro)}</p>

      <div style="text-align:center;margin:32px 0">
        <a href="${data.magicUrl}" class="button" style="font-size:18px;padding:16px 40px">
          ${t.buttonText}
        </a>
        <p style="font-size:12px;color:#9ca3af;margin:14px 0 0">${t.linkValidity}</p>
      </div>

      <p style="font-size:14px;margin-top:20px">${t.footer}</p>
    </div>

    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
      <p style="font-size:11px;margin:10px 0 0">
        <a href="${data.settingsUrl}" class="link-text" style="text-decoration:none">${t.managePrefs}</a> &bull;
        <a href="${this.frontendUrl}/privacy" class="link-text" style="text-decoration:none">${t.privacy}</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `${countText}\n\n${t.greeting} ${data.name},\n\n${fill(t.teaserIntro)}\n\n${t.buttonText}: ${data.magicUrl}\n${t.linkValidity}\n\n${t.managePrefs}: ${data.settingsUrl}\n\n${t.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({
      to: data.to,
      subject: fill(t.subject),
      html,
      text,
      trackingType: 'notification_digest',
      trackingLang: lang,
    });
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  async sendBroadcastEmail(data: BroadcastEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';

    // Convert plain text body to HTML paragraphs
    const bodyHtml = data.body
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p>${this.escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

    const greetings: Record<string, string> = {
      fr: 'Bonjour', en: 'Hello', es: 'Hola', pt: 'Ol\u00e1', it: 'Ciao', de: 'Hallo'
    };
    const teams: Record<string, string> = {
      fr: "L'\u00e9quipe Meeshy", en: 'The Meeshy Team', es: 'El equipo de Meeshy',
      pt: 'A equipe Meeshy', it: 'Il team Meeshy', de: 'Das Meeshy-Team'
    };
    const managePrefs: Record<string, string> = {
      fr: 'G\u00e9rer mes pr\u00e9f\u00e9rences email', en: 'Manage email preferences',
      es: 'Gestionar preferencias de correo', pt: 'Gerenciar prefer\u00eancias de email',
      it: 'Gestisci preferenze email', de: 'E-Mail-Einstellungen verwalten'
    };

    const greeting = greetings[lang] || greetings['en'];
    const team = teams[lang] || teams['en'];
    const manage = managePrefs[lang] || managePrefs['en'];

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${this.escapeHtml(data.subject)}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${this.escapeHtml(data.subject)}</h1>
    </div>

    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${greeting} <strong class="link-text">${this.escapeHtml(data.recipientName)}</strong>,</p>
      ${bodyHtml}
      <p style="font-size:14px;margin-top:30px">${team}</p>
    </div>

    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
      <p style="font-size:11px;margin:10px 0 0">
        <a href="${data.unsubscribeUrl}" class="link-text" style="text-decoration:none">${manage}</a> &bull;
        <a href="${this.frontendUrl}/privacy" class="link-text" style="text-decoration:none">Privacy</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `${greeting} ${data.recipientName},\n\n${data.body}\n\n${team}\n\n${this.getFooterContentText(lang)}\n\n${manage}: ${data.unsubscribeUrl}`;

    return this.sendEmail({
      to: data.to,
      subject: data.subject,
      html,
      text,
      trackingType: 'broadcast',
      trackingLang: lang,
    });
  }
}
