/**
 * LA MODAL « VALIDEZ VOTRE COMPTE » (#8239, loi serveur #8238) — tranche du
 * catalogue `catalog-es.ts`, extraite pour tenir le budget de taille
 * (CLAUDE.md) : le catalogue la RÉPAND. De J7 à J28, l'invitation à prouver
 * son adresse et à ajouter un numéro, sans quitter l'app.
 */
const esActivation = {
  'activation.invite.title': 'Valida tu cuenta',
  'activation.invite.daysLeft': 'Te quedan {days} días para validar tu cuenta. Después, para iniciar sesión se pedirá un código.',
  'activation.invite.daysLeft.one': 'Te queda 1 día para validar tu cuenta. Después, para iniciar sesión se pedirá un código.',
  'activation.invite.lead': 'Valida tu cuenta para seguir usándola sin interrupciones.',
  'activation.email.label': 'Confirma tu dirección de correo',
  'activation.email.send': 'Recibir el código',
  'activation.email.sending': 'Enviando…',
  'activation.email.sent': 'Código enviado a {email}. Introdúcelo a continuación.',
  'activation.email.failed': 'No se pudo enviar el código. Inténtalo de nuevo.',
  'activation.email.done': 'Correo verificado ✓',
  'activation.phone.label': 'Añade un número para proteger y recuperar tu cuenta',
  'activation.phone.add': 'Añadir mi número',
  'activation.phone.field': 'Número de teléfono',
  'activation.phone.hint': 'En formato internacional, por ejemplo +34 612 34 56 78',
  'activation.phone.send': 'Enviar el código',
  'activation.phone.code': 'Código recibido por SMS',
  'activation.phone.verify': 'Validar',
  'activation.phone.busy': 'Enviando…',
  'activation.phone.invalid': 'Introduce un número en formato internacional (+…).',
  'activation.phone.failed': 'No se pudo guardar este número. Inténtalo de nuevo.',
  'activation.phone.codeInvalid': 'Código no válido o caducado',
  'activation.phone.done': 'Número verificado ✓',
  'activation.complete': 'Tu cuenta está validada. ¡Gracias!',
  'activation.later': 'Más tarde',
  'activation.close': 'Cerrar',
} as const;

export default esActivation;
