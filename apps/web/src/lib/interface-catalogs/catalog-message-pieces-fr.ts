/**
 * CHAQUE PIÈCE D'UN MESSAGE SE VISE SEULE (#9907, #9908), FRANÇAIS — la SOURCE
 * des clés `message.piece.*` : le menu d'une pièce, son défilement et ses
 * annonces. Hors du catalogue d'interface, arrivé à son plafond : chargé avec
 * le fil (`i18n-message-pieces-catalog.ts`), jamais au démarrage. `position` se lit « Photo 3 sur 7 » au lecteur
 * d'écran ; `{kind}` est le libellé court du genre (`attachment.kind.*`).
 */
const fr = {
  'message.piece.reply': 'Répondre à ce média',
  'message.piece.save': 'Enregistrer ce média',
  'message.piece.forward': 'Transférer ce média',
  'message.piece.delete': 'Supprimer ce média',
  'message.piece.whole': 'Tout le message',
  'message.piece.position': '{kind} {index} sur {total}',
  'message.piece.previous': 'Média précédent',
  'message.piece.next': 'Média suivant',
  'message.piece.deleted': 'Média supprimé',
  'message.piece.deleteFailed': 'Le média n’a pas pu être supprimé',
  'message.piece.preview': 'Médias du message',
} as const;

export default fr;
