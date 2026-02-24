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
import axios from 'axios';
import { enhancedLogger } from '../utils/logger-enhanced';

// Logger dédié pour EmailService
const logger = enhancedLogger.child({ module: 'EmailService' });


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
  notifications: Array<{
    type: string;
    actorName: string;
    content: string;
    createdAt: string;
  }>;
  markAllReadUrl: string;
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

export interface FriendRequestEmailData {
  to: string;
  recipientName: string;
  senderName: string;
  senderAvatar?: string | null;
  viewRequestUrl: string;
  language?: string;
}

export interface FriendAcceptedEmailData {
  to: string;
  recipientName: string;
  accepterName: string;
  accepterAvatar?: string | null;
  conversationUrl: string;
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

type SupportedLanguage = 'fr' | 'en' | 'es' | 'pt' | 'it' | 'de';

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
  emailChange: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    expiry: string;
    ignoreNote: string;
  };
  friendRequest: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    footer: string;
  };
  friendAccepted: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    footer: string;
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
    },
    emailChange: {
      subject: 'Confirmez votre nouvelle adresse email - Meeshy',
      title: 'Changement d\'adresse email',
      intro: 'Vous avez demandé à changer votre adresse email Meeshy. Pour confirmer ce changement, cliquez sur le bouton ci-dessous :',
      buttonText: 'Confirmer le changement',
      expiry: 'Ce lien expire dans {hours} heures.',
      ignoreNote: 'Si vous n\'avez pas demandé ce changement, ignorez cet email. Votre adresse email actuelle restera inchangée.'
    },
    friendRequest: {
      subject: 'Nouvelle demande de contact - Meeshy',
      title: 'Nouvelle demande de contact',
      intro: '{sender} souhaite vous ajouter comme contact sur Meeshy.',
      buttonText: 'Voir la demande',
      footer: 'Vous pouvez accepter ou refuser cette demande depuis votre espace contacts.'
    },
    friendAccepted: {
      subject: 'Demande de contact acceptee - Meeshy',
      title: 'Demande de contact acceptee',
      intro: '{accepter} a accepte votre demande de contact sur Meeshy.',
      buttonText: 'Envoyer un message',
      footer: 'Vous pouvez maintenant discuter ensemble sur Meeshy.'
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
    },
    emailChange: {
      subject: 'Confirm your new email address - Meeshy',
      title: 'Email Address Change',
      intro: 'You have requested to change your Meeshy email address. To confirm this change, click the button below:',
      buttonText: 'Confirm change',
      expiry: 'This link expires in {hours} hours.',
      ignoreNote: 'If you did not request this change, please ignore this email. Your current email address will remain unchanged.'
    },
    friendRequest: {
      subject: 'New friend request - Meeshy',
      title: 'New Friend Request',
      intro: '{sender} wants to connect with you on Meeshy.',
      buttonText: 'View request',
      footer: 'You can accept or decline this request from your contacts page.'
    },
    friendAccepted: {
      subject: 'Friend request accepted - Meeshy',
      title: 'Friend Request Accepted',
      intro: '{accepter} accepted your friend request on Meeshy.',
      buttonText: 'Send a message',
      footer: 'You can now chat together on Meeshy.'
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
    },
    emailChange: {
      subject: 'Confirma tu nueva dirección de correo - Meeshy',
      title: 'Cambio de dirección de correo',
      intro: 'Has solicitado cambiar tu dirección de correo de Meeshy. Para confirmar este cambio, haz clic en el botón de abajo:',
      buttonText: 'Confirmar cambio',
      expiry: 'Este enlace expira en {hours} horas.',
      ignoreNote: 'Si no solicitaste este cambio, ignora este correo. Tu dirección de correo actual permanecerá sin cambios.'
    },
    friendRequest: {
      subject: 'Nueva solicitud de amistad - Meeshy',
      title: 'Nueva solicitud de amistad',
      intro: '{sender} quiere conectar contigo en Meeshy.',
      buttonText: 'Ver solicitud',
      footer: 'Puedes aceptar o rechazar esta solicitud desde tu pagina de contactos.'
    },
    friendAccepted: {
      subject: 'Solicitud de amistad aceptada - Meeshy',
      title: 'Solicitud de amistad aceptada',
      intro: '{accepter} acepto tu solicitud de amistad en Meeshy.',
      buttonText: 'Enviar un mensaje',
      footer: 'Ahora pueden chatear juntos en Meeshy.'
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
    },
    emailChange: {
      subject: 'Confirme seu novo email - Meeshy',
      title: 'Alteração de endereço de email',
      intro: 'Você solicitou a alteração do seu email do Meeshy. Para confirmar esta alteração, clique no botão abaixo:',
      buttonText: 'Confirmar alteração',
      expiry: 'Este link expira em {hours} horas.',
      ignoreNote: 'Se você não solicitou esta alteração, ignore este email. Seu endereço de email atual permanecerá inalterado.'
    },
    friendRequest: {
      subject: 'Novo pedido de amizade - Meeshy',
      title: 'Novo pedido de amizade',
      intro: '{sender} quer se conectar com voce no Meeshy.',
      buttonText: 'Ver pedido',
      footer: 'Voce pode aceitar ou recusar este pedido na sua pagina de contatos.'
    },
    friendAccepted: {
      subject: 'Pedido de amizade aceite - Meeshy',
      title: 'Pedido de amizade aceite',
      intro: '{accepter} aceitou seu pedido de amizade no Meeshy.',
      buttonText: 'Enviar uma mensagem',
      footer: 'Voces agora podem conversar juntos no Meeshy.'
    }
  },
  it: {
    common: {
      greeting: 'Ciao',
      footer: 'Il team Meeshy',
      copyright: '© {year} Meeshy. Tutti i diritti riservati.'
    },
    verification: {
      subject: 'Verifica la tua email - Meeshy',
      title: 'Benvenuto su Meeshy!',
      intro: 'Grazie per esserti registrato su Meeshy! Per attivare il tuo account, verifica il tuo indirizzo email:',
      buttonText: 'Verifica la mia email',
      expiry: 'Questo link scade tra {hours} ore.',
      ignoreNote: 'Se non hai creato un account, ignora questa email'
    },
    passwordReset: {
      subject: 'Reimposta la tua password - Meeshy',
      title: 'Reimpostazione Password',
      intro: 'Hai richiesto di reimpostare la tua password Meeshy:',
      buttonText: 'Reimposta password',
      expiry: 'Questo link scade tra {minutes} minuti.',
      ignoreNote: 'Se non hai fatto questa richiesta, ignora questa email'
    },
    passwordChanged: {
      subject: 'La tua password è stata modificata - Meeshy',
      title: 'Password Modificata',
      intro: 'La tua password Meeshy è stata modificata con successo.',
      warning: 'Non sei stato tu? Contatta immediatamente il nostro supporto: security@meeshy.me'
    },
    securityAlert: {
      subject: 'Avviso di sicurezza - Meeshy',
      title: 'Avviso di sicurezza',
      actions: 'Azioni consigliate:',
      action1: 'Cambia immediatamente la tua password',
      action2: 'Verifica i tuoi dispositivi connessi',
      action3: "Attiva l'autenticazione a due fattori"
    },
    emailChange: {
      subject: 'Conferma il tuo nuovo indirizzo email - Meeshy',
      title: 'Cambio indirizzo email',
      intro: 'Hai richiesto di cambiare il tuo indirizzo email di Meeshy. Per confermare questo cambio, clicca sul pulsante qui sotto:',
      buttonText: 'Conferma cambio',
      expiry: 'Questo link scade tra {hours} ore.',
      ignoreNote: 'Se non hai richiesto questo cambio, ignora questa email. Il tuo indirizzo email attuale rimarrà invariato.'
    },
    friendRequest: {
      subject: 'Nuova richiesta di amicizia - Meeshy',
      title: 'Nuova richiesta di amicizia',
      intro: '{sender} vuole connettersi con te su Meeshy.',
      buttonText: 'Vedi richiesta',
      footer: 'Puoi accettare o rifiutare questa richiesta dalla tua pagina contatti.'
    },
    friendAccepted: {
      subject: 'Richiesta di amicizia accettata - Meeshy',
      title: 'Richiesta di amicizia accettata',
      intro: '{accepter} ha accettato la tua richiesta di amicizia su Meeshy.',
      buttonText: 'Invia un messaggio',
      footer: 'Ora potete chattare insieme su Meeshy.'
    }
  },
  de: {
    common: {
      greeting: 'Hallo',
      footer: 'Das Meeshy-Team',
      copyright: '© {year} Meeshy. Alle Rechte vorbehalten.'
    },
    verification: {
      subject: 'Bestätige deine E-Mail-Adresse - Meeshy',
      title: 'Willkommen bei Meeshy!',
      intro: 'Danke für deine Registrierung bei Meeshy! Um dein Konto zu aktivieren, bestätige bitte deine E-Mail-Adresse:',
      buttonText: 'E-Mail bestätigen',
      expiry: 'Dieser Link läuft in {hours} Stunden ab.',
      ignoreNote: 'Wenn du kein Konto erstellt hast, ignoriere diese E-Mail'
    },
    passwordReset: {
      subject: 'Passwort zurücksetzen - Meeshy',
      title: 'Passwort zurücksetzen',
      intro: 'Du hast angefordert, dein Meeshy-Passwort zurückzusetzen:',
      buttonText: 'Passwort zurücksetzen',
      expiry: 'Dieser Link läuft in {minutes} Minuten ab.',
      ignoreNote: 'Wenn du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail'
    },
    passwordChanged: {
      subject: 'Dein Passwort wurde geändert - Meeshy',
      title: 'Passwort geändert',
      intro: 'Dein Meeshy-Passwort wurde erfolgreich geändert.',
      warning: 'Das warst nicht du? Kontaktiere sofort unseren Support: security@meeshy.me'
    },
    securityAlert: {
      subject: 'Sicherheitswarnung - Meeshy',
      title: 'Sicherheitswarnung',
      actions: 'Empfohlene Maßnahmen:',
      action1: 'Ändere sofort dein Passwort',
      action2: 'Überprüfe deine verbundenen Geräte',
      action3: 'Aktiviere die Zwei-Faktor-Authentifizierung'
    },
    emailChange: {
      subject: 'Bestätige deine neue E-Mail-Adresse - Meeshy',
      title: 'Änderung der E-Mail-Adresse',
      intro: 'Du hast angefordert, deine Meeshy E-Mail-Adresse zu ändern. Um diese Änderung zu bestätigen, klicke auf den Button unten:',
      buttonText: 'Änderung bestätigen',
      expiry: 'Dieser Link läuft in {hours} Stunden ab.',
      ignoreNote: 'Wenn du diese Änderung nicht angefordert hast, ignoriere diese E-Mail. Deine aktuelle E-Mail-Adresse bleibt unverändert.'
    },
    friendRequest: {
      subject: 'Neue Freundschaftsanfrage - Meeshy',
      title: 'Neue Freundschaftsanfrage',
      intro: '{sender} mochte sich mit dir auf Meeshy verbinden.',
      buttonText: 'Anfrage ansehen',
      footer: 'Du kannst diese Anfrage auf deiner Kontaktseite annehmen oder ablehnen.'
    },
    friendAccepted: {
      subject: 'Freundschaftsanfrage akzeptiert - Meeshy',
      title: 'Freundschaftsanfrage akzeptiert',
      intro: '{accepter} hat deine Freundschaftsanfrage auf Meeshy akzeptiert.',
      buttonText: 'Nachricht senden',
      footer: 'Ihr konnt jetzt zusammen auf Meeshy chatten.'
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
  private defaultLanguage: SupportedLanguage = 'en';
  private brandLogoUrl: string;
  private frontendUrl: string;

  constructor() {
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
    const normalized = language.toLowerCase().substring(0, 2);
    const supported: SupportedLanguage[] = ['fr', 'en', 'es', 'pt', 'it', 'de'];
    return supported.includes(normalized as SupportedLanguage) ? (normalized as SupportedLanguage) : this.defaultLanguage;
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
      'Meeshy',
      `<a href="${this.frontendUrl}" style="color:inherit;text-decoration:underline">Meeshy</a>`
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

  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  private async sendEmail(data: EmailData): Promise<EmailResult> {
    if (data.trackingType) {
      const pixel = this.getTrackingPixelHtml(data.trackingType, data.trackingLang);
      data.html = data.html.replace('</body>', `${pixel}\n</body>`);
    }

    const { to, subject, html, text } = data;

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
          case 'brevo': result = await this.sendViaBrevo(provider.apiKey, data); break;
          case 'sendgrid': result = await this.sendViaSendGrid(provider.apiKey, data); break;
          case 'mailgun': result = await this.sendViaMailgun(provider.apiKey, data); break;
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

  private async sendViaBrevo(apiKey: string, data: EmailData): Promise<EmailResult> {
    logger.info(`[EmailService] [Brevo] 📤 Sending to Brevo API...`);
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: this.fromName, email: this.fromEmail },
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
    const expiry = t.verification.expiry.replace('{hours}', data.expiryHours.toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>🎉 ${t.verification.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.verification.intro}</p><div style="text-align:center"><a href="${data.verificationLink}" class="button">✓ ${t.verification.buttonText}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${data.verificationLink}</p><div class="info"><strong>ℹ️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.verification.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.verification.title}\n\n${t.common.greeting} ${data.name},\n\n${t.verification.intro}\n\n${data.verificationLink}\n\n${expiry}\n\n${t.verification.ignoreNote}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.verification.subject, html, text, trackingType: 'verification', trackingLang: data.language });
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = t.passwordReset.expiry.replace('{minutes}', data.expiryMinutes.toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>🔐 ${t.passwordReset.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.passwordReset.intro}</p><div style="text-align:center"><a href="${data.resetLink}" class="button">${t.passwordReset.buttonText}</a></div><div class="warning"><strong>⚠️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.passwordReset.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.passwordReset.title}\n\n${t.common.greeting} ${data.name},\n\n${t.passwordReset.intro}\n\n${data.resetLink}\n\n${expiry}\n\n${t.passwordReset.ignoreNote}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.passwordReset.subject, html, text, trackingType: 'password_reset', trackingLang: data.language });
  }

  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const dateFormatted = new Date(data.timestamp).toLocaleString(this.getLocale(data.language));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"><h1>✓ ${t.passwordChanged.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.passwordChanged.intro}</p><div class="success"><ul style="margin:10px 0;padding-left:20px"><li><strong>Date:</strong> ${dateFormatted}</li><li><strong>IP:</strong> ${data.ipAddress}</li><li><strong>Location:</strong> ${data.location}</li></ul></div><div class="warning"><strong>⚠️</strong> ${t.passwordChanged.warning}</div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.passwordChanged.title}\n\n${t.common.greeting} ${data.name},\n\n${t.passwordChanged.intro}\n\nDate: ${dateFormatted}\nIP: ${data.ipAddress}\nLocation: ${data.location}\n\n${t.passwordChanged.warning}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.passwordChanged.subject, html, text, trackingType: 'password_changed', trackingLang: data.language });
  }

  async sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)"><h1>🚨 ${t.securityAlert.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><div class="warning"><strong>${data.alertType}</strong><br>${data.details}</div><p><strong>${t.securityAlert.actions}</strong></p><ul><li>${t.securityAlert.action1}</li><li>${t.securityAlert.action2}</li><li>${t.securityAlert.action3}</li></ul><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `🚨 ${t.securityAlert.title}\n\n${t.common.greeting} ${data.name},\n\n${data.alertType}\n${data.details}\n\n${t.securityAlert.actions}\n- ${t.securityAlert.action1}\n- ${t.securityAlert.action2}\n- ${t.securityAlert.action3}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.securityAlert.subject, html, text, trackingType: 'security_alert', trackingLang: data.language });
  }

  async sendEmailChangeVerification(data: EmailChangeVerificationData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const expiry = t.emailChange.expiry.replace('{hours}', data.expiryHours.toString());

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>📧 ${t.emailChange.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${t.emailChange.intro}</p><div style="text-align:center"><a href="${data.verificationLink}" class="button">✓ ${t.emailChange.buttonText}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${data.verificationLink}</p><div class="warning"><strong>⚠️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${t.emailChange.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.emailChange.title}\n\n${t.common.greeting} ${data.name},\n\n${t.emailChange.intro}\n\n${data.verificationLink}\n\n${expiry}\n\n${t.emailChange.ignoreNote}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.emailChange.subject, html, text, trackingType: 'email_change', trackingLang: data.language });
  }

  async sendFriendRequestEmail(data: FriendRequestEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const intro = t.friendRequest.intro.replace('{sender}', data.senderName);
    const avatarHtml = data.senderAvatar
      ? `<img src="${data.senderAvatar}" alt="${this.escapeHtml(data.senderName)}" style="width:64px;height:64px;border-radius:50%;margin-bottom:10px" onerror="this.style.display='none'">`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header"><h1>👋 ${t.friendRequest.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${this.escapeHtml(data.recipientName)}</strong>,</p><div style="text-align:center;margin:20px 0">${avatarHtml}<p style="font-size:16px">${this.escapeHtml(intro)}</p></div><div style="text-align:center"><a href="${data.viewRequestUrl}" class="button">${t.friendRequest.buttonText}</a></div><div class="info"><p style="margin:0">${t.friendRequest.footer}</p></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.friendRequest.title}\n\n${t.common.greeting} ${data.recipientName},\n\n${intro}\n\n${t.friendRequest.buttonText}: ${data.viewRequestUrl}\n\n${t.friendRequest.footer}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.friendRequest.subject, html, text, trackingType: 'friend_request', trackingLang: data.language });
  }

  async sendFriendAcceptedEmail(data: FriendAcceptedEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const intro = t.friendAccepted.intro.replace('{accepter}', data.accepterName);
    const avatarHtml = data.accepterAvatar
      ? `<img src="${data.accepterAvatar}" alt="${this.escapeHtml(data.accepterName)}" style="width:64px;height:64px;border-radius:50%;margin-bottom:10px" onerror="this.style.display='none'">`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"><h1>🎉 ${t.friendAccepted.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${this.escapeHtml(data.recipientName)}</strong>,</p><div style="text-align:center;margin:20px 0">${avatarHtml}<p style="font-size:16px">${this.escapeHtml(intro)}</p></div><div style="text-align:center"><a href="${data.conversationUrl}" class="button">${t.friendAccepted.buttonText}</a></div><div class="success"><p style="margin:0">${t.friendAccepted.footer}</p></div><p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;
    const text = `${t.friendAccepted.title}\n\n${t.common.greeting} ${data.recipientName},\n\n${intro}\n\n${t.friendAccepted.buttonText}: ${data.conversationUrl}\n\n${t.friendAccepted.footer}\n\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`;

    return this.sendEmail({ to: data.to, subject: t.friendAccepted.subject, html, text, trackingType: 'friend_accepted', trackingLang: data.language });
  }

  async sendMagicLinkEmail(data: MagicLinkEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const dateFormatted = new Date().toLocaleString(this.getLocale(lang));

    const content = this.getMagicLinkTranslations(lang);

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
    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro}\n\n${data.magicLink}\n\n${content.expiryTitle}: ${content.expiryText}\n\n${content.requestFrom} ${data.location}\n${content.requestAt} ${dateFormatted}\n\n${content.notYou}\n\n${content.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text, trackingType: 'magic_link', trackingLang: lang });
  }

  private getMagicLinkTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: '🔐 Votre lien de connexion Meeshy',
        title: 'Connexion immédiate à Meeshy',
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
        title: 'Instant Login to Meeshy',
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
        title: 'Inicio de sesión inmediato en Meeshy',
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
        title: 'Login imediato no Meeshy',
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
      },
      it: {
        subject: '🔐 Il tuo link di accesso Meeshy',
        title: 'Accesso immediato a Meeshy',
        subtitle: 'Accesso sicuro con un clic',
        greeting: 'Ciao',
        intro: 'Clicca il pulsante qui sotto per accedere istantaneamente al tuo account Meeshy. Questo link è valido solo per 1 minuto.',
        buttonText: 'Accedi',
        expiryTitle: 'Link monouso',
        expiryText: 'Questo link scade in 1 minuto e può essere usato solo una volta. Per la tua sicurezza, non condividerlo con nessuno.',
        requestFrom: 'Richiesta da:',
        requestAt: 'Richiesto il:',
        fallbackText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
        notYou: 'Se non hai richiesto questo link, puoi ignorare questa email in sicurezza. Il tuo account rimane protetto.',
        footer: 'Il team Meeshy',
        privacy: 'Privacy',
        terms: 'Termini'
      },
      de: {
        subject: '🔐 Dein Meeshy-Anmeldelink',
        title: 'Sofortige Anmeldung bei Meeshy',
        subtitle: 'Sichere Anmeldung mit einem Klick',
        greeting: 'Hallo',
        intro: 'Klicke auf den Button unten, um dich sofort bei deinem Meeshy-Konto anzumelden. Dieser Link ist nur 1 Minute gültig.',
        buttonText: 'Anmelden',
        expiryTitle: 'Einmaliger Link',
        expiryText: 'Dieser Link läuft in 1 Minute ab und kann nur einmal verwendet werden. Zu deiner Sicherheit teile ihn mit niemandem.',
        requestFrom: 'Anfrage von:',
        requestAt: 'Angefordert am:',
        fallbackText: 'Wenn der Button nicht funktioniert, kopiere und füge diesen Link in deinen Browser ein:',
        notYou: 'Wenn du diesen Link nicht angefordert hast, kannst du diese E-Mail ignorieren. Dein Konto bleibt geschützt.',
        footer: 'Das Meeshy-Team',
        privacy: 'Datenschutz',
        terms: 'AGB'
      }
    };
    return translations[language] || translations['en'];
  }

  // ==========================================================================
  // ACCOUNT DELETION EMAILS
  // ==========================================================================

  async sendAccountDeletionConfirmEmail(data: AccountDeletionConfirmEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const content = this.getAccountDeletionConfirmTranslations(lang);

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
    const content = this.getAccountDeletionReminderTranslations(lang);

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

  private getAccountDeletionConfirmTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: '\u26a0\ufe0f Confirmez la suppression de votre compte Meeshy',
        title: 'Suppression de compte',
        subtitle: 'Action irr\u00e9versible',
        greeting: 'Bonjour',
        intro: 'Vous avez demand\u00e9 la suppression de votre compte Meeshy. Pour confirmer cette action, veuillez cliquer sur le bouton ci-dessous.',
        warningTitle: '\u26a0\ufe0f Attention',
        warningText: 'Cette action est irr\u00e9versible. Toutes vos conversations, messages, m\u00e9dias et contacts seront d\u00e9finitivement supprim\u00e9s.',
        gracePeriodTitle: '\ud83d\udcc5 P\u00e9riode de gr\u00e2ce',
        gracePeriodText: 'Apr\u00e8s confirmation, votre compte restera actif pendant 3 mois. Pendant cette p\u00e9riode, vous pourrez annuler la suppression \u00e0 tout moment.',
        confirmButton: 'Confirmer la suppression',
        cancelButton: 'Annuler la demande',
        notYou: 'Si vous n\'avez pas demand\u00e9 cette suppression, cliquez sur "Annuler" ou ignorez cet email. Votre compte reste prot\u00e9g\u00e9.',
        footer: 'L\'\u00e9quipe Meeshy',
      },
      en: {
        subject: '\u26a0\ufe0f Confirm your Meeshy account deletion',
        title: 'Account Deletion',
        subtitle: 'Irreversible action',
        greeting: 'Hello',
        intro: 'You have requested the deletion of your Meeshy account. To confirm this action, please click the button below.',
        warningTitle: '\u26a0\ufe0f Warning',
        warningText: 'This action is irreversible. All your conversations, messages, media, and contacts will be permanently deleted.',
        gracePeriodTitle: '\ud83d\udcc5 Grace Period',
        gracePeriodText: 'After confirmation, your account will remain active for 3 months. During this period, you can cancel the deletion at any time.',
        confirmButton: 'Confirm deletion',
        cancelButton: 'Cancel request',
        notYou: 'If you did not request this deletion, click "Cancel" or ignore this email. Your account remains protected.',
        footer: 'The Meeshy Team',
      },
      es: {
        subject: '\u26a0\ufe0f Confirma la eliminaci\u00f3n de tu cuenta Meeshy',
        title: 'Eliminaci\u00f3n de cuenta',
        subtitle: 'Acci\u00f3n irreversible',
        greeting: 'Hola',
        intro: 'Has solicitado la eliminaci\u00f3n de tu cuenta Meeshy. Para confirmar esta acci\u00f3n, haz clic en el bot\u00f3n de abajo.',
        warningTitle: '\u26a0\ufe0f Advertencia',
        warningText: 'Esta acci\u00f3n es irreversible. Todas tus conversaciones, mensajes, medios y contactos se eliminar\u00e1n permanentemente.',
        gracePeriodTitle: '\ud83d\udcc5 Per\u00edodo de gracia',
        gracePeriodText: 'Despu\u00e9s de la confirmaci\u00f3n, tu cuenta permanecer\u00e1 activa durante 3 meses. Durante este per\u00edodo, puedes cancelar la eliminaci\u00f3n en cualquier momento.',
        confirmButton: 'Confirmar eliminaci\u00f3n',
        cancelButton: 'Cancelar solicitud',
        notYou: 'Si no solicitaste esta eliminaci\u00f3n, haz clic en "Cancelar" o ignora este correo. Tu cuenta permanece protegida.',
        footer: 'El equipo de Meeshy',
      },
      pt: {
        subject: '\u26a0\ufe0f Confirme a exclus\u00e3o da sua conta Meeshy',
        title: 'Exclus\u00e3o de conta',
        subtitle: 'A\u00e7\u00e3o irrevers\u00edvel',
        greeting: 'Ol\u00e1',
        intro: 'Voc\u00ea solicitou a exclus\u00e3o da sua conta Meeshy. Para confirmar esta a\u00e7\u00e3o, clique no bot\u00e3o abaixo.',
        warningTitle: '\u26a0\ufe0f Aten\u00e7\u00e3o',
        warningText: 'Esta a\u00e7\u00e3o \u00e9 irrevers\u00edvel. Todas as suas conversas, mensagens, m\u00eddias e contatos ser\u00e3o permanentemente exclu\u00eddos.',
        gracePeriodTitle: '\ud83d\udcc5 Per\u00edodo de carência',
        gracePeriodText: 'Ap\u00f3s a confirma\u00e7\u00e3o, sua conta permanecer\u00e1 ativa por 3 meses. Durante este per\u00edodo, voc\u00ea pode cancelar a exclus\u00e3o a qualquer momento.',
        confirmButton: 'Confirmar exclus\u00e3o',
        cancelButton: 'Cancelar solicita\u00e7\u00e3o',
        notYou: 'Se voc\u00ea n\u00e3o solicitou esta exclus\u00e3o, clique em "Cancelar" ou ignore este email. Sua conta permanece protegida.',
        footer: 'A equipe Meeshy',
      },
      it: {
        subject: '\u26a0\ufe0f Conferma l\'eliminazione del tuo account Meeshy',
        title: 'Eliminazione account',
        subtitle: 'Azione irreversibile',
        greeting: 'Ciao',
        intro: 'Hai richiesto l\'eliminazione del tuo account Meeshy. Per confermare questa azione, clicca sul pulsante qui sotto.',
        warningTitle: '\u26a0\ufe0f Attenzione',
        warningText: 'Questa azione \u00e8 irreversibile. Tutte le tue conversazioni, messaggi, media e contatti saranno eliminati permanentemente.',
        gracePeriodTitle: '\ud83d\udcc5 Periodo di grazia',
        gracePeriodText: 'Dopo la conferma, il tuo account rester\u00e0 attivo per 3 mesi. Durante questo periodo, puoi annullare l\'eliminazione in qualsiasi momento.',
        confirmButton: 'Conferma eliminazione',
        cancelButton: 'Annulla richiesta',
        notYou: 'Se non hai richiesto questa eliminazione, clicca su "Annulla" o ignora questa email. Il tuo account rimane protetto.',
        footer: 'Il team Meeshy',
      },
      de: {
        subject: '\u26a0\ufe0f Best\u00e4tige die L\u00f6schung deines Meeshy-Kontos',
        title: 'Kontol\u00f6schung',
        subtitle: 'Unwiderrufliche Aktion',
        greeting: 'Hallo',
        intro: 'Du hast die L\u00f6schung deines Meeshy-Kontos angefordert. Um diese Aktion zu best\u00e4tigen, klicke auf den Button unten.',
        warningTitle: '\u26a0\ufe0f Warnung',
        warningText: 'Diese Aktion ist unwiderruflich. Alle deine Unterhaltungen, Nachrichten, Medien und Kontakte werden dauerhaft gel\u00f6scht.',
        gracePeriodTitle: '\ud83d\udcc5 Karenzzeit',
        gracePeriodText: 'Nach der Best\u00e4tigung bleibt dein Konto 3 Monate lang aktiv. In dieser Zeit kannst du die L\u00f6schung jederzeit r\u00fcckg\u00e4ngig machen.',
        confirmButton: 'L\u00f6schung best\u00e4tigen',
        cancelButton: 'Anfrage abbrechen',
        notYou: 'Wenn du diese L\u00f6schung nicht angefordert hast, klicke auf "Abbrechen" oder ignoriere diese E-Mail. Dein Konto bleibt gesch\u00fctzt.',
        footer: 'Das Meeshy-Team',
      },
    };
    return translations[language] || translations['en'];
  }

  private getAccountDeletionReminderTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: '\u23f0 Rappel : Votre compte Meeshy sera bient\u00f4t supprim\u00e9',
        title: 'Rappel de suppression',
        subtitle: 'Votre compte est en attente de suppression',
        greeting: 'Bonjour',
        intro: 'Votre compte Meeshy est pr\u00e9vu pour \u00eatre supprim\u00e9 le {date}. Si vous souhaitez conserver votre compte, vous pouvez annuler cette demande.',
        reminderTitle: '\u23f0 Rappel',
        reminderText: 'La p\u00e9riode de gr\u00e2ce a expir\u00e9. Votre compte sera supprim\u00e9 d\u00e9finitivement si vous ne l\'annulez pas.',
        cancelButton: 'Annuler la suppression',
        deleteNowButton: 'Supprimer maintenant',
        cancelNote: 'Cliquez sur "Annuler la suppression" pour conserver votre compte et toutes vos donn\u00e9es.',
        footer: 'L\'\u00e9quipe Meeshy',
      },
      en: {
        subject: '\u23f0 Reminder: Your Meeshy account will be deleted soon',
        title: 'Deletion Reminder',
        subtitle: 'Your account is pending deletion',
        greeting: 'Hello',
        intro: 'Your Meeshy account is scheduled to be deleted on {date}. If you wish to keep your account, you can cancel this request.',
        reminderTitle: '\u23f0 Reminder',
        reminderText: 'The grace period has expired. Your account will be permanently deleted unless you cancel.',
        cancelButton: 'Cancel deletion',
        deleteNowButton: 'Delete now',
        cancelNote: 'Click "Cancel deletion" to keep your account and all your data.',
        footer: 'The Meeshy Team',
      },
      es: {
        subject: '\u23f0 Recordatorio: Tu cuenta Meeshy ser\u00e1 eliminada pronto',
        title: 'Recordatorio de eliminaci\u00f3n',
        subtitle: 'Tu cuenta est\u00e1 pendiente de eliminaci\u00f3n',
        greeting: 'Hola',
        intro: 'Tu cuenta Meeshy est\u00e1 programada para ser eliminada el {date}. Si deseas conservar tu cuenta, puedes cancelar esta solicitud.',
        reminderTitle: '\u23f0 Recordatorio',
        reminderText: 'El per\u00edodo de gracia ha expirado. Tu cuenta ser\u00e1 eliminada permanentemente a menos que la canceles.',
        cancelButton: 'Cancelar eliminaci\u00f3n',
        deleteNowButton: 'Eliminar ahora',
        cancelNote: 'Haz clic en "Cancelar eliminaci\u00f3n" para conservar tu cuenta y todos tus datos.',
        footer: 'El equipo de Meeshy',
      },
      pt: {
        subject: '\u23f0 Lembrete: Sua conta Meeshy ser\u00e1 exclu\u00edda em breve',
        title: 'Lembrete de exclus\u00e3o',
        subtitle: 'Sua conta est\u00e1 pendente de exclus\u00e3o',
        greeting: 'Ol\u00e1',
        intro: 'Sua conta Meeshy est\u00e1 programada para ser exclu\u00edda em {date}. Se deseja manter sua conta, pode cancelar esta solicita\u00e7\u00e3o.',
        reminderTitle: '\u23f0 Lembrete',
        reminderText: 'O per\u00edodo de carência expirou. Sua conta ser\u00e1 permanentemente exclu\u00edda se voc\u00ea n\u00e3o cancelar.',
        cancelButton: 'Cancelar exclus\u00e3o',
        deleteNowButton: 'Excluir agora',
        cancelNote: 'Clique em "Cancelar exclus\u00e3o" para manter sua conta e todos os seus dados.',
        footer: 'A equipe Meeshy',
      },
      it: {
        subject: '\u23f0 Promemoria: Il tuo account Meeshy sar\u00e0 eliminato presto',
        title: 'Promemoria eliminazione',
        subtitle: 'Il tuo account \u00e8 in attesa di eliminazione',
        greeting: 'Ciao',
        intro: 'Il tuo account Meeshy \u00e8 programmato per essere eliminato il {date}. Se desideri mantenere il tuo account, puoi annullare questa richiesta.',
        reminderTitle: '\u23f0 Promemoria',
        reminderText: 'Il periodo di grazia \u00e8 scaduto. Il tuo account sar\u00e0 eliminato permanentemente se non annulli.',
        cancelButton: 'Annulla eliminazione',
        deleteNowButton: 'Elimina ora',
        cancelNote: 'Clicca su "Annulla eliminazione" per mantenere il tuo account e tutti i tuoi dati.',
        footer: 'Il team Meeshy',
      },
      de: {
        subject: '\u23f0 Erinnerung: Dein Meeshy-Konto wird bald gel\u00f6scht',
        title: 'L\u00f6scherinnerung',
        subtitle: 'Dein Konto wartet auf L\u00f6schung',
        greeting: 'Hallo',
        intro: 'Dein Meeshy-Konto ist f\u00fcr die L\u00f6schung am {date} geplant. Wenn du dein Konto behalten m\u00f6chtest, kannst du diese Anfrage stornieren.',
        reminderTitle: '\u23f0 Erinnerung',
        reminderText: 'Die Karenzzeit ist abgelaufen. Dein Konto wird dauerhaft gel\u00f6scht, wenn du nicht stornierst.',
        cancelButton: 'L\u00f6schung abbrechen',
        deleteNowButton: 'Jetzt l\u00f6schen',
        cancelNote: 'Klicke auf "L\u00f6schung abbrechen", um dein Konto und alle deine Daten zu behalten.',
        footer: 'Das Meeshy-Team',
      },
    };
    return translations[language] || translations['en'];
  }

  // ==========================================================================
  // NOTIFICATION DIGEST EMAIL
  // ==========================================================================

  async sendNotificationDigestEmail(data: NotificationDigestEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const t = this.getDigestTranslations(lang);

    const notifListHtml = data.notifications.map(n => {
      const timeAgo = this.formatTimeAgo(n.createdAt, lang);
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
          <strong class="link-text">${this.escapeHtml(n.actorName)}</strong>
          <span style="color:#6b7280"> ${this.escapeHtml(n.content)}</span>
          <br><span style="font-size:12px;color:#9ca3af">${timeAgo}</span>
        </td>
      </tr>`;
    }).join('');

    const countText = t.unreadTitle.replace('{count}', data.unreadCount.toString());

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${t.subject.replace('{count}', data.unreadCount.toString())}</title>
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
      <p>${t.intro.replace('{count}', data.unreadCount.toString())}</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        ${notifListHtml}
      </table>

      ${data.unreadCount > data.notifications.length ? `<p style="font-size:13px;color:#9ca3af;text-align:center">${t.andMore.replace('{count}', (data.unreadCount - data.notifications.length).toString())}</p>` : ''}

      <div style="text-align:center;margin:30px 0">
        <a href="${data.markAllReadUrl}" class="button" style="font-size:18px;padding:16px 40px">
          ${t.buttonText}
        </a>
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

    const notifListText = data.notifications.map(n => `- ${n.actorName}: ${n.content}`).join('\n');
    const text = `${countText}\n\n${t.greeting} ${data.name},\n\n${t.intro.replace('{count}', data.unreadCount.toString())}\n\n${notifListText}\n\n${t.buttonText}: ${data.markAllReadUrl}\n\n${t.managePrefs}: ${data.settingsUrl}\n\n${t.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({
      to: data.to,
      subject: t.subject.replace('{count}', data.unreadCount.toString()),
      html,
      text,
      trackingType: 'notification_digest',
      trackingLang: lang,
    });
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private formatTimeAgo(dateStr: string, lang: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const labels: Record<string, { min: string; hour: string; day: string; days: string }> = {
      fr: { min: 'min', hour: 'h', day: 'jour', days: 'jours' },
      en: { min: 'min', hour: 'h', day: 'day', days: 'days' },
      es: { min: 'min', hour: 'h', day: 'dia', days: 'dias' },
      pt: { min: 'min', hour: 'h', day: 'dia', days: 'dias' },
      it: { min: 'min', hour: 'h', day: 'giorno', days: 'giorni' },
      de: { min: 'Min', hour: 'Std', day: 'Tag', days: 'Tage' },
    };
    const l = labels[lang] || labels['en'];

    if (diffMins < 60) return `${diffMins} ${l.min}`;
    if (diffHours < 24) return `${diffHours} ${l.hour}`;
    if (diffDays === 1) return `1 ${l.day}`;
    return `${diffDays} ${l.days}`;
  }

  private getDigestTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: 'Vous avez {count} notifications non lues - Meeshy',
        unreadTitle: 'Vous avez {count} notifications non lues',
        subtitle: 'Voici un resume de votre activite',
        greeting: 'Bonjour',
        intro: 'Vous avez {count} notifications en attente sur Meeshy. Voici les plus recentes :',
        andMore: '... et {count} autres notifications',
        buttonText: 'Voir mes notifications',
        footer: "L'equipe Meeshy",
        managePrefs: 'Gerer mes preferences email',
        privacy: 'Confidentialite',
      },
      en: {
        subject: 'You have {count} unread notifications - Meeshy',
        unreadTitle: 'You have {count} unread notifications',
        subtitle: "Here's a summary of your activity",
        greeting: 'Hello',
        intro: 'You have {count} pending notifications on Meeshy. Here are the most recent:',
        andMore: '... and {count} more notifications',
        buttonText: 'View my notifications',
        footer: 'The Meeshy Team',
        managePrefs: 'Manage email preferences',
        privacy: 'Privacy',
      },
      es: {
        subject: 'Tienes {count} notificaciones sin leer - Meeshy',
        unreadTitle: 'Tienes {count} notificaciones sin leer',
        subtitle: 'Aqui tienes un resumen de tu actividad',
        greeting: 'Hola',
        intro: 'Tienes {count} notificaciones pendientes en Meeshy. Aqui estan las mas recientes:',
        andMore: '... y {count} notificaciones mas',
        buttonText: 'Ver mis notificaciones',
        footer: 'El equipo de Meeshy',
        managePrefs: 'Gestionar preferencias de correo',
        privacy: 'Privacidad',
      },
      pt: {
        subject: 'Voce tem {count} notificacoes nao lidas - Meeshy',
        unreadTitle: 'Voce tem {count} notificacoes nao lidas',
        subtitle: 'Aqui esta um resumo da sua atividade',
        greeting: 'Ola',
        intro: 'Voce tem {count} notificacoes pendentes no Meeshy. Aqui estao as mais recentes:',
        andMore: '... e mais {count} notificacoes',
        buttonText: 'Ver minhas notificacoes',
        footer: 'A equipe Meeshy',
        managePrefs: 'Gerenciar preferencias de email',
        privacy: 'Privacidade',
      },
      it: {
        subject: 'Hai {count} notifiche non lette - Meeshy',
        unreadTitle: 'Hai {count} notifiche non lette',
        subtitle: 'Ecco un riepilogo della tua attivita',
        greeting: 'Ciao',
        intro: 'Hai {count} notifiche in sospeso su Meeshy. Ecco le piu recenti:',
        andMore: '... e altre {count} notifiche',
        buttonText: 'Vedi le mie notifiche',
        footer: 'Il team Meeshy',
        managePrefs: 'Gestisci preferenze email',
        privacy: 'Privacy',
      },
      de: {
        subject: 'Du hast {count} ungelesene Benachrichtigungen - Meeshy',
        unreadTitle: 'Du hast {count} ungelesene Benachrichtigungen',
        subtitle: 'Hier ist eine Zusammenfassung deiner Aktivitat',
        greeting: 'Hallo',
        intro: 'Du hast {count} ausstehende Benachrichtigungen auf Meeshy. Hier sind die neuesten:',
        andMore: '... und {count} weitere Benachrichtigungen',
        buttonText: 'Meine Benachrichtigungen ansehen',
        footer: 'Das Meeshy-Team',
        managePrefs: 'E-Mail-Einstellungen verwalten',
        privacy: 'Datenschutz',
      },
    };
    return translations[language] || translations['en'];
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
