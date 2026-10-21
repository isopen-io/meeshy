/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-es.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const esVerifyEmail = {
  'verifyEmail.backToLogin': 'Volver a iniciar sesión',
  'verifyEmail.verified': '¡Correo verificado!',
  'verifyEmail.code.label': 'Código de verificación',
  'verifyEmail.submit': 'Verificar',
  'verifyEmail.submit.busy': 'Verificando…',
  'verifyEmail.error.invalid': 'Código no válido o caducado',
  'verifyEmail.error.offline': 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  'verifyEmail.error.rateLimited': 'Demasiados intentos: vuelve a intentarlo en unos minutos.',
  'verifyEmail.link.checking': 'Comprobando el enlace…',
  'verifyEmail.proven': 'Dirección confirmada ✓ — introduce el código recibido para iniciar sesión aquí.',
  'emailSent.codeOrLink': 'Introduce el código de 6 dígitos recibido en {email} o abre el enlace del mismo correo.',
  'signInLink.switchAccount.title': '¿Abrir OTRA cuenta?',
  'signInLink.switchAccount.lead': 'Has iniciado sesión como @{current}, pero lo que acabas de abrir lleva a otra cuenta:',
  'signInLink.switchAccount.warning': 'Si no pediste este enlace o código tú mismo, cancela: tu sesión sigue abierta y nada cambia.',
  'signInLink.switchAccount.cancel': 'Cancelar y quedarme en @{current}',
  'signInLink.switchAccount.confirm': 'Abrir esta otra cuenta',
  'signInLink.switchAccount.kept': '@{current} seguirá en tus cuentas en este dispositivo.',
  'signInLink.switchAccount.busy': 'Un momento…',
  'signInLink.switchAccount.failed': 'No se puede abrir esta otra cuenta en este momento. Tu sesión sigue abierta y el enlace se ha cerrado.',
  'signInLink.switchAccount.expired': 'Este enlace ha caducado: solicita uno nuevo. Tu sesión sigue abierta.',
  'signInLink.switchAccount.leave': 'Volver al inicio',
  'emailSent.title': 'Correo enviado',
  'emailSent.openLink': 'Abre el enlace enviado a {email}',
  'emailSent.nothingReceived': '¿No has recibido nada?',
  'emailSent.nothingReceived.text': 'Revisa tu carpeta de spam: el mensaje puede haber llegado allí.',
};

export default esVerifyEmail;
