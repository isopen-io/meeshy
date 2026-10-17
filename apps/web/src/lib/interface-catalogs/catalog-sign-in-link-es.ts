import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const es = {
  'signInLink.confirm.title': '¿Iniciar sesión como @{username}?',
  'signInLink.confirm.lead': 'Este enlace no se solicitó desde este dispositivo. Continúa solo si esta cuenta es tuya.',
  'signInLink.confirm.leadSignedIn': 'Has iniciado sesión como @{current}. Este enlace abriría la cuenta de abajo en su lugar; @{current} seguirá en tus cuentas en este dispositivo.',
  'signInLink.confirm.accept': 'Iniciar sesión',
  'signInLink.confirm.cancel': 'Cancelar',
  'signInLink.confirm.claim': 'Esta dirección se vinculará a @{username} y se retirará de cualquier otra cuenta de Meeshy.',
  'signInLink.confirm.acceptClaim': 'Vincular la dirección e iniciar sesión',
  'verifyEmail.bar.title': 'Verificación del correo',
  'verifyEmail.noAddress': 'Este enlace no incluye ninguna dirección de correo que verificar. Ábrelo desde el correo que te envió Meeshy.',
  'verifyEmail.continue': 'Continuar',
  'verifyEmail.title': 'Revisa tu correo',
  'verifyEmail.subtitle': 'Introduce el código de 6 dígitos enviado a {email}',
  'verifyEmail.subtitle.created': 'Hemos creado tu cuenta y enviado un código y un enlace a {email}. Introduce el código o abre el enlace.',
  'verifyEmail.subtitle.pending': 'Tu contraseña es correcta, pero primero debes activar tu cuenta demostrando que esta dirección es tuya. Acabamos de enviar un código y un enlace a {email}.',
  'verifyEmail.subtitle.pending.inbox': 'Abre tu bandeja de entrada y revisa también la carpeta de correo no deseado.',
  'verifyEmail.resend.prompt': '¿No has recibido el código?',
  'verifyEmail.resend': 'Reenviar el código',
  'verifyEmail.resend.busy': 'Enviando…',
  'verifyEmail.resend.locked': 'Reenviar el código ({seconds}s)',
  'verifyEmail.resend.done': '¡Código reenviado!',
  'verifyEmail.link.invalid': 'Este enlace ya no es válido. Introduce el código del mismo correo.',
  'verifyEmail.handoff.opened': 'El enlace se abrió en la app Meeshy.',
  'verifyEmail.handoff.stay': 'Continuar en el navegador',
  'verifyEmail.arrival.title': '¡Dirección confirmada!',
  'verifyEmail.arrival.lead': 'Preparando tus conversaciones…',
  'verifyEmail.arrival.status': 'Dirección confirmada — iniciando sesión…',
} satisfies SignInLinkCatalog;

export default es;
