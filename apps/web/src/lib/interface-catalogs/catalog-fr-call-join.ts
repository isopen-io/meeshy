/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche française du catalogue, RÉPANDUE par
 * `catalog-fr.ts` comme `catalog-fr-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const frCallJoin = {
  'callJoin.action': 'Rejoindre',
  'callJoin.named': 'Rejoindre l’appel avec {name}',
  'callJoin.header': 'Rejoindre l’appel en cours',
  'callJoin.resume.title': 'Appel en cours',
  'callJoin.resume.action': 'Reprendre',
  'callJoin.resume.named': 'Reprendre l’appel avec {name}',
  'callJoin.detail.title': 'Détail de l’appel',
  'callJoin.detail.type': 'Type',
  'callJoin.detail.date': 'Date',
  'callJoin.detail.duration': 'Durée',
  'callJoin.detail.data': 'Données',
  'callJoin.detail.openConversation': 'Ouvrir la conversation',
  'callJoin.detail.loading': 'Chargement de l’appel',
  'callJoin.detail.notFound.title': 'Appel introuvable',
  'callJoin.detail.notFound.body': 'Cet appel n’existe plus ou ne vous est pas accessible.',
  'callJoin.detail.joining': 'Connexion à l’appel…',
  'keypad.title': 'Clavier',
  'keypad.open': 'Composer un numéro',
  'keypad.input.placeholder': 'Numéro ou nom',
  'keypad.input.label': 'Numéro ou nom à rechercher',
  'keypad.delete': 'Effacer',
  'keypad.clear': 'Tout effacer',
  'keypad.prompt.title': 'Composez un numéro ou un nom',
  'keypad.prompt.subtitle': 'Trouvez une personne par numéro de téléphone ou par nom.',
  'keypad.searching': 'Recherche…',
  'keypad.noMatch.title': 'Aucun contact trouvé',
  'keypad.noMatch.subtitle': 'Vérifiez le numéro ou le nom saisi.',
  'keypad.error.title': 'La recherche a échoué',
  'keypad.error.body': 'Vérifiez votre connexion puis réessayez.',
  'keypad.offline.title': 'Hors ligne',
  'keypad.offline.body': 'La recherche reprendra au retour du réseau.',
  'keypad.results': 'Résultats',
  'keypad.call.audio.named': 'Appel vocal à {name}',
  'keypad.call.video.named': 'Appel vidéo à {name}',
  'keypad.call.failed': 'L’appel n’a pas pu démarrer. Réessayez.',
  'keypad.retry': 'Réessayer',
} as const;

export default frCallJoin;
