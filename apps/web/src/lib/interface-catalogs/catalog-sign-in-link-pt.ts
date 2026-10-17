import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const pt = {
  'signInLink.confirm.title': 'Entrar como @{username}?',
  'signInLink.confirm.lead': 'Este link não foi pedido a partir deste dispositivo. Continue apenas se esta conta for sua.',
  'signInLink.confirm.leadSignedIn': 'Você está conectado como @{current}. Este link abriria a conta abaixo no lugar dela; @{current} continuará nas suas contas neste dispositivo.',
  'signInLink.confirm.accept': 'Entrar',
  'signInLink.confirm.cancel': 'Cancelar',
} satisfies SignInLinkCatalog;

export default pt;
