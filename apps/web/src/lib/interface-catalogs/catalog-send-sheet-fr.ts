/**
 * LE CATALOGUE DE LA FEUILLE D'ENVOI, FRANÇAIS (#8884) — la SOURCE des clés
 * `sendSheet.*` (transfert, partage, publication : une seule base, directive
 * porteur 2026-09-30) et `shareLinkSheet.*` (les textes de la feuille « Créer
 * un lien de partage », `components/share-link-sheet.tsx`, jusque-là écrits en
 * dur). Les six autres langues portent exactement ces clés
 * (`satisfies SendSheetCatalog`, `i18n-send-sheet-catalog.test.ts`).
 *
 * Les textes sont neutres (ni tu ni vous) : la feuille s'adresse à tout le
 * monde, y compris en partage entrant.
 */
const fr = {
  'sendSheet.title.forward': 'Transférer',
  'sendSheet.title.share': 'Partager',
  'sendSheet.title.sendTo': 'Envoyer à…',
  'sendSheet.cancel': 'Annuler',
  'sendSheet.caption.label': 'Message',
  'sendSheet.caption.placeholder': 'Ajouter un message…',
  'sendSheet.search.label': 'Rechercher une personne ou une conversation',
  'sendSheet.search.placeholder': 'Rechercher une personne ou une conversation',
  'sendSheet.empty': 'Aucun résultat',
  'sendSheet.section.recent': 'Récents',
  'sendSheet.section.people': 'Personnes',
  'sendSheet.section.conversations': 'Conversations',
  'sendSheet.section.publish': 'Publier',
  'sendSheet.publish.story': 'Ma story',
  'sendSheet.publish.post': 'Post',
  'sendSheet.publish.reel': 'Réel',
  'sendSheet.send': 'Envoyer',
  'sendSheet.sendCount': 'Envoyer ({count})',
  'sendSheet.row.select': 'Sélectionner {name}',
  'sendSheet.selectedCount': '{count} sélectionnés',
  'sendSheet.state.sending': 'Envoi…',
  'sendSheet.state.sent': 'Envoyé',
  'sendSheet.state.failed': 'Échec',
  'sendSheet.state.retry': 'Réessayer',
  'sendSheet.state.waitingNetwork': 'En attente de réseau',
  'sendSheet.failure.download': 'Impossible de récupérer le fichier',
  'sendSheet.failure.refused': 'L’envoi a été refusé',
  'sendSheet.limit.recipients': '{count} destinataires au plus',
  'sendSheet.error.captionTooLong': 'Ce message est trop long pour une publication ({count} caractères au plus)',
  'sendSheet.error.tooManyFiles': '{count} fichiers au plus par publication',
  'sendSheet.moreOptions': 'Plus d’options…',
  'sendSheet.copyLink': 'Copier le lien',
  'sendSheet.linkCopied': 'Lien copié',
  'sendSheet.announce.sent': 'Envoyé à {count}',
  'sendSheet.preview.messages': '{count} messages',
  'sendSheet.preview.photo': 'Photo',
  'sendSheet.preview.video': 'Vidéo',
  'sendSheet.preview.voice': 'Message vocal',
  'sendSheet.preview.file': 'Fichier',
  'sendSheet.preview.publication': 'Publication',
  'sendSheet.protected': 'Contenu protégé : il ne peut pas être publié',
  'shareLinkSheet.title': 'Créer un lien de partage',
  'shareLinkSheet.empty': 'Aucune conversation ne peut recevoir un lien pour l’instant.',
  'shareLinkSheet.createFailed': 'Impossible de créer le lien — réessayez dans un instant.',
  'shareLinkSheet.copied': 'Lien copié — il ne reste qu’à le coller.',
  'shareLinkSheet.unavailable': 'Impossible de partager ici. Copiez l’adresse de cette page.',
} as const;

export default fr;
