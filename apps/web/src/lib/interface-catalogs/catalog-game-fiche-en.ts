import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const en = {
  'game.fiche.light.label': 'Your light',
  'game.fiche.light.to_heritage': 'Open your Legacy',
  'game.fiche.heritage.held.none': 'Your Legacy',
  'game.fiche.heritage.held.bourse': 'Your Purse',
  'game.fiche.heritage.held.escarcelle': 'Your Pouch',
  'game.fiche.heritage.held.coffret': 'Your Casket',
  'game.fiche.heritage.held.coffre': 'Your Chest',
  'game.fiche.heritage.held.tresor': 'Your Treasure',
  'game.fiche.heritage.held.reserve': 'Your Reserve',
  'game.fiche.heritage.opens.bourse': 'the Purse opens at {count}',
  'game.fiche.heritage.opens.escarcelle': 'the Pouch opens at {count}',
  'game.fiche.heritage.opens.coffret': 'the Casket opens at {count}',
  'game.fiche.heritage.opens.coffre': 'the Chest opens at {count}',
  'game.fiche.heritage.opens.tresor': 'the Treasure opens at {count}',
  'game.fiche.heritage.opens.reserve': 'the Reserve opens at {count}',
  'game.fiche.heritage.minted.one': '{count} minted since the beginning',
  'game.fiche.heritage.minted.other': '{count} minted since the beginning',
  'game.fiche.mint.sentence': 'It sets {price} of your light into the coin; your light holds {held}.',
  'game.fiche.mint.missing': '{missing} more to mint it.',
  'game.fiche.mint.mee.next_gold': 'No. {number} will be gold.',
  'game.fiche.mint.mee.next_prism': 'No. {number} will be prism.',
  'game.fiche.mint.mee.gold': 'This one will be gold: your ancestors will see it.',
  'game.fiche.mint.mee.prism': 'This one will be prism: every language will shine in it.',
  'game.fiche.mint.mee.wait': 'A little more light, and we mint together.',
} as const satisfies GameFicheCatalog;

export default en;
