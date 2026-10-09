import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const itCommentRow = {
  'comments.action.like': 'Mi piace',
  'comments.action.unlike': 'Non mi piace più',
  'comments.action.edit': 'Modifica',
  'comments.action.delete': 'Elimina',
  'comments.edit.label': 'Modifica commento',
  'comments.edit.save': 'Salva',
  'comments.edit.cancel': 'Annulla',
  'comments.action.reply': 'Rispondi',
  'comments.reply.to': 'Risposta a {name}',
  'comments.reply.cancel': 'Annulla la risposta',
  'comments.composer.fold': 'Chiudi il campo del commento',
  'comments.composer.unfold': 'Mostra il campo del commento',
  'comments.composer.attach': 'Allega una foto, un video o un suono',
  'comments.composer.voice': 'Registra un commento vocale',
  'comments.media.upload_failed': 'Non è stato possibile inviare l’allegato.',
  'comments.media.unsupported': '«{name}»: un commento può contenere solo foto, video e audio.',
  'comments.media.limit': 'Non più di {count} allegati per commento.',
  'comments.media.duplicate': '«{name}» è già allegato a questo commento.',
  'comments.replies.show': 'Vedi risposte ({count})',
  'comments.replies.hide': 'Nascondi risposte',
  'comments.replies.more': 'Vedi altre risposte',
  'comments.replies.error': 'Impossibile caricare le risposte',
  'comments.replies.label': 'Risposte a {name}',
  'comments.action.image_with_replies': 'Crea immagine con le risposte',
  'comments.report.title': 'Segnala questo commento',
} satisfies CommentRowCatalogSlice;

export default itCommentRow;
