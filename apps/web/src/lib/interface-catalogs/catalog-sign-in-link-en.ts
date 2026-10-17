import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const en = {
  'signInLink.confirm.title': 'Sign in as @{username}?',
  'signInLink.confirm.lead': 'This link wasn’t requested from this device. Only continue if this account is yours.',
  'signInLink.confirm.leadSignedIn': 'You’re signed in as @{current}. This link would open the account below instead; @{current} will stay in your accounts on this device.',
  'signInLink.confirm.accept': 'Sign in',
  'signInLink.confirm.cancel': 'Cancel',
} satisfies SignInLinkCatalog;

export default en;
