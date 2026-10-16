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
} satisfies AccountRecoveryCatalog;

export default es;
