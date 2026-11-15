/**
 * RETIRER LE CONTENU D'UN AUTRE (#11150) — tranche du catalogue, extraite pour
 * tenir le budget de taille : `catalog-fr` la RÉPAND. Le vocabulaire est celui du
 * contrat : « Retirer », « Motif du retrait », « L'auteur sera prévenu du motif ».
 */
const frContentRemoval = {
  'moderation.remove.action': 'Retirer',
  'moderation.remove.title': 'Retirer ce contenu',
  'moderation.remove.reason.label': 'Motif du retrait',
  'moderation.remove.reason.notice': 'L’auteur sera prévenu du motif.',
  'moderation.remove.reason.bounds': 'Au moins {min} caractères, au plus {max}.',
  'moderation.remove.done': 'Contenu retiré',
  'moderation.remove.failed': 'Le retrait a été refusé : le contenu est revenu.',
  'moderation.remove.notification.reason': 'Motif : {reason}',
  'moderation.remove.reason.count': '{count} sur {max}',
} as const;

export default frContentRemoval;
