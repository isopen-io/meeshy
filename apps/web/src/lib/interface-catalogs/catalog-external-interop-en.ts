import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const en = {
  'externalInterop.notice.title': 'Write to a friend on WhatsApp',
  'externalInterop.notice.lead': 'To reach your friend on WhatsApp, Meeshy shares with Meta, which operates WhatsApp:',
  'externalInterop.disclosure.phone-number': 'your verified phone number, which identifies you on WhatsApp;',
  'externalInterop.disclosure.profile-name': 'your display name;',
  'externalInterop.disclosure.public-keys': 'the public encryption keys of your devices;',
  'externalInterop.disclosure.encrypted-content': 'your messages and media, end-to-end encrypted: Meta cannot read them;',
  'externalInterop.disclosure.delivery-metadata': 'who writes to whom, when, the size of what is sent and delivery receipts.',
  'externalInterop.notice.retention': 'Meeshy keeps your friend’s number for {days} days after you last open the conversation, then erases it.',
  'externalInterop.notice.retention.unknown': 'Meeshy keeps your friend’s number for a limited time, then erases it.',
  'externalInterop.notice.translation': 'Translation happens on your device: Meeshy never sees the content of this conversation.',
  'externalInterop.notice.withdraw': 'You can withdraw this consent at any time: Meeshy then erases your WhatsApp friends’ numbers.',
  'externalInterop.notice.accept': 'I agree and continue',
  'externalInterop.notice.accept.busy': 'Saving…',
  'externalInterop.notice.cancel': 'Cancel',
  'externalInterop.notice.outdated': 'This information has changed: update Meeshy to read it again before agreeing.',
  'externalInterop.notice.unavailable': 'Writing to a friend on WhatsApp is not available here yet.',
  'externalInterop.notice.error': 'Your consent could not be saved. Try again.',
  'externalInterop.report.title': 'Report this WhatsApp content',
  'externalInterop.report.lead': 'Meeshy cannot read this conversation: only what you choose to attach is sent to our moderation team.',
  'externalInterop.report.reason': 'Reason',
  'externalInterop.report.attach': 'Attach the message text',
  'externalInterop.report.attach.hint': 'The attached text is sent unencrypted to Meeshy’s moderation team.',
  'externalInterop.report.block': 'Block this contact on Meeshy',
  'externalInterop.report.submit': 'Send report',
  'externalInterop.report.submit.busy': 'Sending…',
  'externalInterop.report.cancel': 'Cancel',
  'externalInterop.report.done.title': 'Report sent',
  'externalInterop.report.done.blocked': 'This contact is blocked: you will no longer receive their messages on Meeshy.',
  'externalInterop.report.done.orientation': 'Meeshy cannot act on their WhatsApp account. To have this content removed from WhatsApp, use the reporting offered by Meta.',
  'externalInterop.report.done.close': 'Close',
  'externalInterop.report.error': 'The report could not be sent. Try again.',
} satisfies ExternalInteropCatalog;

export default en;
