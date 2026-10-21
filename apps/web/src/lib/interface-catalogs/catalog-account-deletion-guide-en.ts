import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const enAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Delete your Meeshy account',
  'accountDeletion.guide.intro': 'This page is about the Meeshy app on Android, iOS and the web. It explains how to delete your account and what happens to your data.',
  'accountDeletion.guide.steps.title': 'How to do it',
  'accountDeletion.guide.step.signIn': 'Sign in with the button below. In the app, the same request is in Settings, Delete account.',
  'accountDeletion.guide.step.confirm': 'Type the confirmation phrase and your password, then request the deletion.',
  'accountDeletion.guide.step.email': 'Open the email we send you and confirm the deletion.',
  'accountDeletion.guide.step.wait': 'Your account is deleted 30 days later. There is nothing else to do.',
  'accountDeletion.guide.signIn': 'Sign in to delete my account',
  'accountDeletion.guide.deleted.title': 'What is deleted',
  'accountDeletion.guide.deleted.profile': 'Your profile: name, username, email, phone number, photo, banner, bio and date of birth.',
  'accountDeletion.guide.deleted.access': 'Your password, your sessions and your encryption keys.',
  'accountDeletion.guide.deleted.messages': 'The text of your messages and their translations, your photos, videos and voice messages.',
  'accountDeletion.guide.deleted.other': 'Your voice profile, your address book, your notifications, your share links, your game progress and your stickers.',
  'accountDeletion.guide.kept.title': 'What is kept',
  'accountDeletion.guide.kept.messages': 'In other people’s conversations, your messages stay in place, empty and marked as deleted.',
  'accountDeletion.guide.kept.posts': 'The text of your posts and comments stays visible under the name “Deleted account”. To remove them, delete them in the app before your request.',
  'accountDeletion.guide.kept.packs': 'Sticker packs you published stay available, without your name.',
  'accountDeletion.guide.kept.stats': 'An anonymous account identifier and usage statistics that cannot identify you.',
  'accountDeletion.guide.delay.title': 'Timeline',
  'accountDeletion.guide.delay.body': 'Your account is deleted 30 days after you confirm. Until then, you can cancel with the link in the email.',
  'accountDeletion.guide.noAccess.title': 'Can’t sign in anymore?',
  'accountDeletion.guide.noAccess.body': 'Write to us from your account’s email address asking for its deletion. We reply within 30 days.',
} as const satisfies AccountDeletionGuideCatalog;

export default enAccountDeletionGuide;
