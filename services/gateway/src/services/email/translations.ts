/**
 * Les TABLES de traduction des e-mails — extraites d'`EmailService.ts` par
 * #6424.
 *
 * ## Pourquoi elles partent
 *
 * `EmailService.ts` portait 1842 lignes pour un plafond DUR de 1200, et le
 * dépôt interdit d'ajouter à un fichier hors budget : on extrait d'abord, on
 * ajoute ensuite (directive 2026-09-02). Le lot qui fait porter au premier
 * e-mail d'un compte son identité dérivée et ses liens d'édition devait faire
 * grossir deux gabarits — ce sont donc les TABLES qui sortent.
 *
 * ## Pourquoi ce découpage-là, et pas un autre
 *
 * Ce fichier ne contient que de la DONNÉE et le type qui la décrit : aucune
 * table ne lit `this`, aucune ne compose de HTML, aucune n'envoie rien. Le
 * découpage suit donc une responsabilité entière — « ce que les e-mails
 * DISENT », par langue — et non une tranche arbitraire. `EmailService` garde
 * ce qui COMPOSE et ce qui ENVOIE.
 *
 * Les cinq tables par gabarit étaient des méthodes PRIVÉES déclarant chacune
 * une constante locale `translations` qui MASQUAIT la table globale du même
 * nom. Elles deviennent des fonctions ; leur corps est repris sans
 * modification, masquage local compris, pour que l'extraction reste
 * mécaniquement vérifiable.
 *
 * @module services/email/translations
 */



export type SupportedLanguage = 'fr' | 'en' | 'es' | 'pt' | 'it' | 'de';

export interface EmailTranslations {
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
  passwordSet: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
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
  loginAlert: {
    subject: string;
    title: string;
    intro: string;
    deviceLabel: string;
    appLabel: string;
    locationLabel: string;
    ipLabel: string;
    timeLabel: string;
    previousTitle: string;
    revokeTitle: string;
    revokeButton: string;
    revokeExpiry: string;
    mapAlt: string;
  };
  emailChange: {
    subject: string;
    title: string;
    intro: string;
    buttonText: string;
    expiry: string;
    ignoreNote: string;
  };
}

export const translations: Record<SupportedLanguage, EmailTranslations> = {
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
    passwordSet: {
      subject: 'Définissez votre mot de passe - Meeshy',
      title: 'Définir votre mot de passe',
      intro: 'Vous avez demandé à définir un mot de passe pour votre compte Meeshy :',
      buttonText: 'Définir mon mot de passe'
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
    loginAlert: {
      subject: 'Nouvelle connexion detectee - Meeshy',
      title: 'Nouvelle connexion detectee',
      intro: 'Une connexion a ete effectuee sur votre compte.',
      deviceLabel: 'Appareil',
      appLabel: 'Application',
      locationLabel: 'Localisation',
      ipLabel: 'Adresse IP',
      timeLabel: 'Date/heure',
      previousTitle: 'Derniere connexion connue',
      revokeTitle: 'Ce n\'est pas vous ?',
      revokeButton: 'Deconnecter tous mes appareils',
      revokeExpiry: 'Ce lien expire dans 24 heures.',
      mapAlt: 'Carte',
    },
    emailChange: {
      subject: 'Confirmez votre nouvelle adresse email - Meeshy',
      title: 'Changement d\'adresse email',
      intro: 'Vous avez demandé à changer votre adresse email Meeshy. Pour confirmer ce changement, cliquez sur le bouton ci-dessous :',
      buttonText: 'Confirmer le changement',
      expiry: 'Ce lien expire dans {hours} heures.',
      ignoreNote: 'Si vous n\'avez pas demandé ce changement, ignorez cet email. Votre adresse email actuelle restera inchangée.'
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
    passwordSet: {
      subject: 'Set your password - Meeshy',
      title: 'Set your password',
      intro: 'You have requested to set a password for your Meeshy account:',
      buttonText: 'Set my password'
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
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
    emailChange: {
      subject: 'Confirm your new email address - Meeshy',
      title: 'Email Address Change',
      intro: 'You have requested to change your Meeshy email address. To confirm this change, click the button below:',
      buttonText: 'Confirm change',
      expiry: 'This link expires in {hours} hours.',
      ignoreNote: 'If you did not request this change, please ignore this email. Your current email address will remain unchanged.'
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
    passwordSet: {
      subject: 'Establece tu contraseña - Meeshy',
      title: 'Establecer tu contraseña',
      intro: 'Has solicitado establecer una contraseña para tu cuenta de Meeshy:',
      buttonText: 'Establecer mi contraseña'
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
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
    emailChange: {
      subject: 'Confirma tu nueva dirección de correo - Meeshy',
      title: 'Cambio de dirección de correo',
      intro: 'Has solicitado cambiar tu dirección de correo de Meeshy. Para confirmar este cambio, haz clic en el botón de abajo:',
      buttonText: 'Confirmar cambio',
      expiry: 'Este enlace expira en {hours} horas.',
      ignoreNote: 'Si no solicitaste este cambio, ignora este correo. Tu dirección de correo actual permanecerá sin cambios.'
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
    passwordSet: {
      subject: 'Defina sua senha - Meeshy',
      title: 'Definir sua senha',
      intro: 'Você solicitou definir uma senha para sua conta Meeshy:',
      buttonText: 'Definir minha senha'
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
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
    emailChange: {
      subject: 'Confirme seu novo email - Meeshy',
      title: 'Alteração de endereço de email',
      intro: 'Você solicitou a alteração do seu email do Meeshy. Para confirmar esta alteração, clique no botão abaixo:',
      buttonText: 'Confirmar alteração',
      expiry: 'Este link expira em {hours} horas.',
      ignoreNote: 'Se você não solicitou esta alteração, ignore este email. Seu endereço de email atual permanecerá inalterado.'
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
    passwordSet: {
      subject: 'Imposta la tua password - Meeshy',
      title: 'Imposta la tua password',
      intro: 'Hai richiesto di impostare una password per il tuo account Meeshy:',
      buttonText: 'Imposta la mia password'
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
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
    emailChange: {
      subject: 'Conferma il tuo nuovo indirizzo email - Meeshy',
      title: 'Cambio indirizzo email',
      intro: 'Hai richiesto di cambiare il tuo indirizzo email di Meeshy. Per confermare questo cambio, clicca sul pulsante qui sotto:',
      buttonText: 'Conferma cambio',
      expiry: 'Questo link scade tra {hours} ore.',
      ignoreNote: 'Se non hai richiesto questo cambio, ignora questa email. Il tuo indirizzo email attuale rimarrà invariato.'
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
    passwordSet: {
      subject: 'Lege dein Passwort fest - Meeshy',
      title: 'Passwort festlegen',
      intro: 'Du hast angefordert, ein Passwort für dein Meeshy-Konto festzulegen:',
      buttonText: 'Mein Passwort festlegen'
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
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
    emailChange: {
      subject: 'Bestätige deine neue E-Mail-Adresse - Meeshy',
      title: 'Änderung der E-Mail-Adresse',
      intro: 'Du hast angefordert, deine Meeshy E-Mail-Adresse zu ändern. Um diese Änderung zu bestätigen, klicke auf den Button unten:',
      buttonText: 'Änderung bestätigen',
      expiry: 'Dieser Link läuft in {hours} Stunden ab.',
      ignoreNote: 'Wenn du diese Änderung nicht angefordert hast, ignoriere diese E-Mail. Deine aktuelle E-Mail-Adresse bleibt unverändert.'
    }
  }
};

export function getAlertTypeLabel(alertType: string, language: string): { label: string; description: string; icon: string; isInfo: boolean } {
  const labels: Record<string, Record<string, { label: string; description: string; icon: string; isInfo: boolean }>> = {
    fr: {
      login_new_device: { label: 'Nouvelle connexion detectee', description: 'Une connexion a ete effectuee depuis un nouvel appareil ou navigateur.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Mot de passe modifie', description: 'Votre mot de passe a ete change avec succes.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Double authentification activee', description: 'La verification en deux etapes a ete activee sur votre compte.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Double authentification desactivee', description: 'La verification en deux etapes a ete desactivee sur votre compte.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Activite suspecte', description: 'Nous avons detecte une activite inhabituelle sur votre compte.', icon: '🚨', isInfo: false },
      user_mentioned: { label: 'Nouvelle mention', description: 'Vous avez ete mentionne.', icon: '💬', isInfo: true },
      missed_call: { label: 'Appel manque', description: 'Vous avez un appel manque.', icon: '📞', isInfo: true },
      generic_notification: { label: 'Nouvelle notification', description: 'Vous avez une nouvelle notification.', icon: '🔔', isInfo: true },
    },
    en: {
      login_new_device: { label: 'New login detected', description: 'A login was made from a new device or browser.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Password changed', description: 'Your password was changed successfully.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Two-factor authentication enabled', description: 'Two-step verification has been enabled on your account.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Two-factor authentication disabled', description: 'Two-step verification has been disabled on your account.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Suspicious activity', description: 'We detected unusual activity on your account.', icon: '🚨', isInfo: false },
      user_mentioned: { label: 'New mention', description: 'You were mentioned.', icon: '💬', isInfo: true },
      missed_call: { label: 'Missed call', description: 'You have a missed call.', icon: '📞', isInfo: true },
      generic_notification: { label: 'New notification', description: 'You have a new notification.', icon: '🔔', isInfo: true },
    },
    es: {
      login_new_device: { label: 'Nuevo inicio de sesión detectado', description: 'Se ha iniciado sesión desde un nuevo dispositivo o navegador.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Contraseña modificada', description: 'Tu contraseña se ha cambiado correctamente.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Autenticación de dos factores activada', description: 'La verificación en dos pasos se ha activado en tu cuenta.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Autenticación de dos factores desactivada', description: 'La verificación en dos pasos se ha desactivado en tu cuenta.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Actividad sospechosa', description: 'Hemos detectado actividad inusual en tu cuenta.', icon: '🚨', isInfo: false },
      user_mentioned: { label: 'Nueva mención', description: 'Te han mencionado.', icon: '💬', isInfo: true },
      missed_call: { label: 'Llamada perdida', description: 'Tienes una llamada perdida.', icon: '📞', isInfo: true },
      generic_notification: { label: 'Nueva notificación', description: 'Tienes una nueva notificación.', icon: '🔔', isInfo: true },
    },
    pt: {
      login_new_device: { label: 'Novo início de sessão detetado', description: 'Foi efetuado um início de sessão a partir de um novo dispositivo ou navegador.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Palavra-passe alterada', description: 'A sua palavra-passe foi alterada com sucesso.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Autenticação de dois fatores ativada', description: 'A verificação em duas etapas foi ativada na sua conta.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Autenticação de dois fatores desativada', description: 'A verificação em duas etapas foi desativada na sua conta.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Atividade suspeita', description: 'Detetámos atividade invulgar na sua conta.', icon: '🚨', isInfo: false },
      user_mentioned: { label: 'Nova menção', description: 'Você foi mencionado.', icon: '💬', isInfo: true },
      missed_call: { label: 'Chamada perdida', description: 'Tem uma chamada perdida.', icon: '📞', isInfo: true },
      generic_notification: { label: 'Nova notificação', description: 'Tem uma nova notificação.', icon: '🔔', isInfo: true },
    },
    it: {
      login_new_device: { label: 'Nuovo accesso rilevato', description: 'È stato effettuato un accesso da un nuovo dispositivo o browser.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Password modificata', description: 'La tua password è stata modificata correttamente.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Autenticazione a due fattori attivata', description: 'La verifica in due passaggi è stata attivata sul tuo account.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Autenticazione a due fattori disattivata', description: 'La verifica in due passaggi è stata disattivata sul tuo account.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Attività sospetta', description: "Abbiamo rilevato un'attività insolita sul tuo account.", icon: '🚨', isInfo: false },
      user_mentioned: { label: 'Nuova menzione', description: 'Sei stato menzionato.', icon: '💬', isInfo: true },
      missed_call: { label: 'Chiamata persa', description: 'Hai una chiamata persa.', icon: '📞', isInfo: true },
      generic_notification: { label: 'Nuova notifica', description: 'Hai una nuova notifica.', icon: '🔔', isInfo: true },
    },
    de: {
      login_new_device: { label: 'Neue Anmeldung erkannt', description: 'Es wurde eine Anmeldung von einem neuen Gerät oder Browser vorgenommen.', icon: '🔐', isInfo: true },
      password_changed: { label: 'Passwort geändert', description: 'Dein Passwort wurde erfolgreich geändert.', icon: '🔑', isInfo: true },
      two_factor_enabled: { label: 'Zwei-Faktor-Authentifizierung aktiviert', description: 'Die Zwei-Schritt-Verifizierung wurde für dein Konto aktiviert.', icon: '🛡️', isInfo: true },
      two_factor_disabled: { label: 'Zwei-Faktor-Authentifizierung deaktiviert', description: 'Die Zwei-Schritt-Verifizierung wurde für dein Konto deaktiviert.', icon: '⚠️', isInfo: false },
      suspicious_activity: { label: 'Verdächtige Aktivität', description: 'Wir haben ungewöhnliche Aktivitäten in deinem Konto festgestellt.', icon: '🚨', isInfo: false },
      user_mentioned: { label: 'Neue Erwähnung', description: 'Du wurdest erwähnt.', icon: '💬', isInfo: true },
      missed_call: { label: 'Verpasster Anruf', description: 'Du hast einen verpassten Anruf.', icon: '📞', isInfo: true },
      generic_notification: { label: 'Neue Benachrichtigung', description: 'Du hast eine neue Benachrichtigung.', icon: '🔔', isInfo: true },
    },
  };
  const lang = labels[language] ? language : 'fr';
  // Unknown types fall back to a neutral notification label — NEVER to
  // login_new_device, which would mislabel any social notification (a
  // mention, a missed call, …) as a "new login detected" security alert.
  return labels[lang][alertType] ?? labels[lang]['generic_notification'];
}

export function getMagicLinkTranslations(language: string): Record<string, string> {
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

export function getAccountDeletionConfirmTranslations(language: string): Record<string, string> {
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

export function getAccountDeletionReminderTranslations(language: string): Record<string, string> {
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

export function getDigestTranslations(language: string): Record<string, string> {
  const translations: Record<string, Record<string, string>> = {
    fr: {
      subject: 'Vous avez {count} notifications non lues - Meeshy',
      unreadTitle: 'Vous avez {count} notifications non lues',
      subtitle: 'Quelque chose vous attend',
      greeting: 'Bonjour',
      teaserIntro: 'Vous avez {count} notification(s) en attente sur Meeshy. Revenez voir ce que vous manquez — un seul clic, sans mot de passe.',
      buttonText: 'Ouvrir Meeshy',
      linkValidity: 'Ce lien de connexion est valable 24 h.',
      footer: "L'equipe Meeshy",
      managePrefs: 'Gerer mes preferences email',
      privacy: 'Confidentialite',
    },
    en: {
      subject: 'You have {count} unread notifications - Meeshy',
      unreadTitle: 'You have {count} unread notifications',
      subtitle: 'Something is waiting for you',
      greeting: 'Hello',
      teaserIntro: 'You have {count} notification(s) waiting on Meeshy. Come see what you are missing — one click, no password needed.',
      buttonText: 'Open Meeshy',
      linkValidity: 'This login link is valid for 24h.',
      footer: 'The Meeshy Team',
      managePrefs: 'Manage email preferences',
      privacy: 'Privacy',
    },
    es: {
      subject: 'Tienes {count} notificaciones sin leer - Meeshy',
      unreadTitle: 'Tienes {count} notificaciones sin leer',
      subtitle: 'Algo te esta esperando',
      greeting: 'Hola',
      teaserIntro: 'Tienes {count} notificacion(es) pendientes en Meeshy. Ven a ver lo que te estas perdiendo — un clic, sin contrasena.',
      buttonText: 'Abrir Meeshy',
      linkValidity: 'Este enlace de acceso es valido durante 24 h.',
      footer: 'El equipo de Meeshy',
      managePrefs: 'Gestionar preferencias de correo',
      privacy: 'Privacidad',
    },
    pt: {
      subject: 'Voce tem {count} notificacoes nao lidas - Meeshy',
      unreadTitle: 'Voce tem {count} notificacoes nao lidas',
      subtitle: 'Algo esta esperando por voce',
      greeting: 'Ola',
      teaserIntro: 'Voce tem {count} notificacao(oes) pendentes no Meeshy. Venha ver o que esta perdendo — um clique, sem senha.',
      buttonText: 'Abrir Meeshy',
      linkValidity: 'Este link de acesso e valido por 24 h.',
      footer: 'A equipe Meeshy',
      managePrefs: 'Gerenciar preferencias de email',
      privacy: 'Privacidade',
    },
    it: {
      subject: 'Hai {count} notifiche non lette - Meeshy',
      unreadTitle: 'Hai {count} notifiche non lette',
      subtitle: 'Qualcosa ti aspetta',
      greeting: 'Ciao',
      teaserIntro: 'Hai {count} notifica/e in sospeso su Meeshy. Torna a vedere cosa ti stai perdendo — un clic, senza password.',
      buttonText: 'Apri Meeshy',
      linkValidity: 'Questo link di accesso e valido per 24 h.',
      footer: 'Il team Meeshy',
      managePrefs: 'Gestisci preferenze email',
      privacy: 'Privacy',
    },
    de: {
      subject: 'Du hast {count} ungelesene Benachrichtigungen - Meeshy',
      unreadTitle: 'Du hast {count} ungelesene Benachrichtigungen',
      subtitle: 'Etwas wartet auf dich',
      greeting: 'Hallo',
      teaserIntro: 'Du hast {count} Benachrichtigung(en) auf Meeshy. Schau, was du verpasst — ein Klick, ohne Passwort.',
      buttonText: 'Meeshy offnen',
      linkValidity: 'Dieser Login-Link ist 24 Std. gultig.',
      footer: 'Das Meeshy-Team',
      managePrefs: 'E-Mail-Einstellungen verwalten',
      privacy: 'Datenschutz',
    },
  };
  return translations[language] || translations['en'];
}
