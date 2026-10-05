/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-fr.ts` comme `catalog-fr-call-feedback.ts`.
 */
const frCallsErase = {
  'calls.edit': 'Modifier',
  'calls.editDone': 'OK',
  'calls.hide.named': 'Effacer l’appel avec {name} du journal',
  'calls.clearAll': 'Tout effacer',
  'calls.clearAll.confirm': 'Effacer tout votre journal d’appels ? Les autres participants gardent le leur.',
  'calls.clearAll.confirmAction': 'Effacer',
  'calls.clearAll.cancel': 'Annuler',
  'calls.erase.failed': 'L’effacement n’a pas abouti. Réessayez.',
  'calls.search': 'Rechercher un nom',
  'calls.search.clear': 'Effacer la recherche',
  'calls.search.empty': 'Aucun appel ne correspond à « {query} »',
  'calls.participants.more': '{names} +{count}',
  'calls.participants.a11y': 'avec {names}',
  'callJoin.detail.participants': 'Participants',
  'callJoin.detail.reactions': 'Réactions',
  'calls.filter.videoOnly': 'Appels vidéo seulement',
} as const;

export default frCallsErase;
