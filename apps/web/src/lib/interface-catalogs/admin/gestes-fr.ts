/**
 * LE FRAGMENT « GESTES » (#10392, #10394) — les gestes de publication et de
 * modération posés depuis une liste, une fiche ou un signalement : hors ligne,
 * remise en ligne, audience choisie. Préfixe exclusif : `admin.gesture.`.
 */
const f = {
  'admin.gesture.col': 'Gestes',
  'admin.gesture.group': 'Gestes sur cette publication',
  'admin.gesture.takeOffline': 'Mettre hors ligne',
  'admin.gesture.restore': 'Remettre en ligne',
  'admin.gesture.audience': 'Audience',
  'admin.gesture.audience.placeholder': 'Changer l’audience…',
  'admin.gesture.takeOffline.title': 'Mettre cette publication hors ligne ?',
  'admin.gesture.takeOffline.body': 'Elle disparaît du fil, des profils et des liens. Son auteur la voit encore, sans pouvoir la rouvrir. « Remettre en ligne » la rend telle qu’elle était.',
  'admin.gesture.restore.title': 'Remettre cette publication en ligne ?',
  'admin.gesture.restore.body': 'Le retrait est levé et la publication retrouve l’audience que son auteur avait choisie.',
  'admin.gesture.audience.title': 'Servir cette publication à : {audience} ?',
  'admin.gesture.audience.body': 'L’audience choisie remplace celle de l’auteur ; un retrait de modération en cours est levé.',
  'admin.gesture.motive': 'Motif',
  'admin.gesture.done.takeOffline': 'Publication mise hors ligne.',
  'admin.gesture.done.restore': 'Publication remise en ligne.',
  'admin.gesture.done.audience': 'Audience de la publication changée.',
  'admin.gesture.filter.state': 'État',
} as const;

export default f;
