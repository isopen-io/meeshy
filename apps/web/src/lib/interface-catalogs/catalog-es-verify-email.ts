/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-es.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const esVerifyEmail = {
  'verifyEmail.bar.title': 'Verificación del correo',
  'verifyEmail.noAddress': 'Este enlace no incluye ninguna dirección de correo que verificar. Ábrelo desde el correo que te envió Meeshy.',
  'verifyEmail.backToLogin': 'Volver a iniciar sesión',
  'verifyEmail.verified': '¡Correo verificado!',
  'verifyEmail.continue': 'Continuar',
  'verifyEmail.title': 'Revisa tu correo',
  'verifyEmail.subtitle': 'Introduce el código de 6 dígitos enviado a {email}',
  'verifyEmail.subtitle.created': 'Hemos creado tu cuenta y enviado un código y un enlace a {email}. Introduce el código o abre el enlace.',
  'verifyEmail.subtitle.pending': 'Tu cuenta está pendiente de verificación: hemos reenviado un código y un enlace a {email}.',
  'verifyEmail.code.label': 'Código de verificación',
  'verifyEmail.submit': 'Verificar',
  'verifyEmail.submit.busy': 'Verificando…',
  'verifyEmail.error.invalid': 'Código no válido o caducado',
  'verifyEmail.error.offline': 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  'verifyEmail.error.rateLimited': 'Demasiados intentos: vuelve a intentarlo en unos minutos.',
  'verifyEmail.resend.prompt': '¿No has recibido el código?',
  'verifyEmail.resend': 'Reenviar el código',
  'verifyEmail.resend.busy': 'Enviando…',
  'verifyEmail.resend.locked': 'Reenviar el código ({seconds}s)',
  'verifyEmail.resend.done': '¡Código reenviado!',
  'verifyEmail.link.checking': 'Comprobando el enlace…',
  'verifyEmail.link.invalid': 'Este enlace ya no es válido. Introduce el código del mismo correo.',
  'verifyEmail.proven': 'Dirección confirmada ✓ — introduce el código recibido para iniciar sesión aquí.',
  'verifyEmail.handoff.opened': 'El enlace se abrió en la app Meeshy.',
  'verifyEmail.handoff.stay': 'Continuar en el navegador',
  'verifyEmail.signingIn': 'Iniciando sesión…',
  'verifyEmail.arrival.title': '¡Dirección confirmada!',
  'verifyEmail.arrival.lead': 'Preparando tus conversaciones…',
  'verifyEmail.arrival.status': 'Dirección confirmada — iniciando sesión…',
  'emailSent.codeOrLink': 'Introduce el código de 6 dígitos recibido en {email} o abre el enlace del mismo correo.',
};

export default esVerifyEmail;
