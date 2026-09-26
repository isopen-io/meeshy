/**
 * REFUSER UN APPEL AVEC UN MESSAGE (#8065) — tranche du catalogue, RÉPANDUE
 * par `catalog-en.ts` comme `catalog-en-call.ts`.
 */
const enCallDecline = {
  'callDecline.open': 'Message',
  'callDecline.title': 'Decline with a message',
  'callDecline.reply.callBack': 'I’ll call you back.',
  'callDecline.reply.meeting': 'I’m in a meeting.',
  'callDecline.reply.cantTalk': 'I can’t talk right now.',
  'callDecline.reply.writeMe': 'Text me, I’ll reply soon.',
  'callDecline.custom.label': 'Your message',
  'callDecline.custom.placeholder': 'Write a message…',
  'callDecline.custom.send': 'Send and decline',
  'callDecline.cancel': 'Cancel',
} as const;

export default enCallDecline;
