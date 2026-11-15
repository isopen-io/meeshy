/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*` : ce que la scène plein écran écrit (ta lumière, le « tchak », les aïeux qui se manifestent, la phrase de Mee à la fête et au refus). Chargé par la scène elle-même, au toucher (`components/game/mint-ceremony.tsx`), jamais avec un écran. Le français est la SOURCE des clés ; les six autres langues portent exactement les mêmes. */
const fr = {
  'game.frappe.light': 'ta lumière',
  'game.frappe.tchak': 'Tchak\u00a0!',
  'game.frappe.tchak_final': 'TCHAK\u00a0!',
  'game.frappe.ancestors.title': 'Tes aïeux se manifestent',
  'game.frappe.ancestors.gold': 'chaque centième pièce porte leur lumière',
  'game.frappe.ancestors.prism': 'chaque millième pièce réunit toutes les langues',
  'game.frappe.say.silver': 'La n° {number} rejoint ton Héritage.',
  'game.frappe.say.gold': 'La n° {number} est d’or. Tes aïeux l’ont vue.',
  'game.frappe.say.prism': 'La n° {number} est de prisme\u00a0: toutes les langues y brillent.',
  'game.frappe.glory': '+{glory} de gloire',
  'game.frappe.refused.shadow': 'Une ombre voile ta lumière. Tes prochaines étincelles la dissiperont, et on frappera.',
  'game.frappe.refused.locked': 'Ton Héritage attend un rang plus haut. Ta gloire l’ouvrira, et on frappera.',
  'game.frappe.refused.light': 'Ta lumière ne suffit pas encore. Tes prochaines étincelles la nourriront.',
  'game.frappe.refused.offline': 'Pas de connexion pour l’instant. Dès qu’elle revient, on frappe.',
  'game.frappe.refused.unknown': 'La frappe n’a pas eu lieu. Rien n’est perdu\u00a0: ta lumière est intacte.',
  'game.frappe.skip': 'Toucher pour passer',
} as const;

export default fr;
