/**
 * REFUSER UN APPEL AVEC UN MESSAGE (#8065) — tranche du catalogue, RÉPANDUE
 * par `catalog-es.ts` comme `catalog-es-call.ts`.
 */
const esCallDecline = {
  'callDecline.open': 'Mensaje',
  'callDecline.title': 'Rechazar con un mensaje',
  'callDecline.reply.callBack': 'Te llamo luego.',
  'callDecline.reply.meeting': 'Estoy en una reunión.',
  'callDecline.reply.cantTalk': 'Ahora no puedo hablar.',
  'callDecline.reply.writeMe': 'Escríbeme, te respondo enseguida.',
  'callDecline.custom.label': 'Tu mensaje',
  'callDecline.custom.placeholder': 'Escribe un mensaje…',
  'callDecline.custom.send': 'Enviar y rechazar',
  'callDecline.cancel': 'Cancelar',
} as const;

export default esCallDecline;
