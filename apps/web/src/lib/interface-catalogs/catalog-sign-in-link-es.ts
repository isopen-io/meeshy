import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const es = {
  'signInLink.confirm.title': '¿Iniciar sesión como @{username}?',
  'signInLink.confirm.lead': 'Este enlace no se solicitó desde este dispositivo. Continúa solo si esta cuenta es tuya.',
  'signInLink.confirm.leadSignedIn': 'Has iniciado sesión como @{current}. Este enlace abriría la cuenta de abajo en su lugar; @{current} seguirá en tus cuentas en este dispositivo.',
  'signInLink.confirm.accept': 'Iniciar sesión',
  'signInLink.confirm.cancel': 'Cancelar',
} satisfies SignInLinkCatalog;

export default es;
