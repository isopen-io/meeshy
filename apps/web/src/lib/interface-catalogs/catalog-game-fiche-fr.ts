/**
 * LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178, épopée § 3.3 et § 5) — `game.fiche.light.*`, `game.fiche.heritage.*`,
 * `game.fiche.mint.*` : ce que la tête des deux fiches et le cadre de la frappe écrivent. En tête ce qu'on POSSÈDE
 * (ta lumière, les Meeshes gardées), en petit le « depuis toujours », le prix UNE fois dans une phrase. Le contenant se
 * dit avec son article et son possessif : une clé par contenant, l'accord ne se calcule pas. Le français est la SOURCE
 * des clés ; les six autres langues portent exactement les mêmes.
 */
const fr = {
  'game.fiche.light.label': 'Ta lumière',
  'game.fiche.light.to_heritage': 'Ouvrir ton Héritage',
  'game.fiche.heritage.held.none': 'Ton Héritage',
  'game.fiche.heritage.held.bourse': 'Ta Bourse',
  'game.fiche.heritage.held.escarcelle': 'Ton Escarcelle',
  'game.fiche.heritage.held.coffret': 'Ton Coffret',
  'game.fiche.heritage.held.coffre': 'Ton Coffre',
  'game.fiche.heritage.held.tresor': 'Ton Trésor',
  'game.fiche.heritage.held.reserve': 'Ta Réserve',
  'game.fiche.heritage.opens.bourse': 'la Bourse s’ouvre à {count}',
  'game.fiche.heritage.opens.escarcelle': 'l’Escarcelle s’ouvre à {count}',
  'game.fiche.heritage.opens.coffret': 'le Coffret s’ouvre à {count}',
  'game.fiche.heritage.opens.coffre': 'le Coffre s’ouvre à {count}',
  'game.fiche.heritage.opens.tresor': 'le Trésor s’ouvre à {count}',
  'game.fiche.heritage.opens.reserve': 'la Réserve s’ouvre à {count}',
  'game.fiche.heritage.minted.one': '{count} frappée depuis toujours',
  'game.fiche.heritage.minted.other': '{count} frappées depuis toujours',
  'game.fiche.mint.sentence': 'Elle fige {price} de ta lumière, qui en compte {held}.',
  'game.fiche.mint.missing': 'Il en manque encore {missing} pour la frapper.',
  'game.fiche.mint.mee.next_gold': 'La n° {number} sera d’or.',
  'game.fiche.mint.mee.next_prism': 'La n° {number} sera de prisme.',
  'game.fiche.mint.mee.gold': 'Celle-ci sera d’or : tes aïeux la verront.',
  'game.fiche.mint.mee.prism': 'Celle-ci sera de prisme : toutes les langues y brilleront.',
  'game.fiche.mint.mee.wait': 'Encore un peu de lumière, et on frappe ensemble.',
} as const;

export default fr;
