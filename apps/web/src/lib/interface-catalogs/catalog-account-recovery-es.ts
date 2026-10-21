import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const es = {
  'recovery.forgot.lead': 'Recibe por correo un enlace para elegir una nueva contraseña.',
  'recovery.forgot.neverHad': '¿Nunca has tenido contraseña?',
  'recovery.forgot.neverHad.text': 'El mismo enlace te permite crear una.',
  'recovery.reset.newPassword': 'Nueva contraseña',
  'recovery.reset.lead': 'Elige una nueva contraseña.',
  'recovery.reset.confirm': 'Confirmar contraseña',
  'recovery.reset.tooShort': 'Contraseña demasiado corta (mín. {min} caracteres)',
  'recovery.reset.mismatch': 'Las contraseñas no coinciden',
  'recovery.reset.submit': 'Guardar contraseña',
  'recovery.reset.submit.busy': 'Guardando…',
  'recovery.reset.invalid.title': 'Enlace no válido o caducado',
  'recovery.reset.invalid.text': 'Solicita un nuevo enlace para elegir tu contraseña.',
  'recovery.reset.invalid.action': 'Solicitar un nuevo enlace',
  'recovery.reset.done.title': 'Contraseña guardada',
  'recovery.reset.done.text': 'Ya puedes iniciar sesión con tu nueva contraseña.',
  'recovery.reset.code': 'Código de verificación',
  'recovery.reset.code.lead': 'Introduce el código de 6 dígitos de tu aplicación de autenticación.',
  'recovery.reset.error.codeRequired': 'Esta cuenta está protegida: introduce el código de verificación de tu aplicación de autenticación.',
  'recovery.reset.error.codeInvalid': 'Código de verificación incorrecto.',
  'recovery.reset.error.weak': 'Esta contraseña es demasiado fácil de adivinar. Elige una más larga o menos previsible.',
  'recovery.reset.error.reused': 'Ya usaste esta contraseña recientemente. Elige otra.',
  'recovery.reset.error.rateLimited': 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
  'recovery.reset.error.locked': 'Esta cuenta está bloqueada temporalmente. Contacta con el soporte.',
  'recovery.reset.exhausted.title': 'Demasiados códigos incorrectos',
  'recovery.reset.exhausted.text': 'Por seguridad, este enlace se ha desactivado. Solicita uno nuevo.',
} satisfies AccountRecoveryCatalog;

export default es;
