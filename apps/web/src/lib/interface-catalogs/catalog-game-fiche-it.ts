import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const it = {
  'game.fiche.light.label': 'La tua luce',
  'game.fiche.light.to_heritage': 'Apri la tua Eredità',
  'game.fiche.heritage.held.none': 'La tua Eredità',
  'game.fiche.heritage.held.bourse': 'La tua Borsa',
  'game.fiche.heritage.held.escarcelle': 'La tua Scarsella',
  'game.fiche.heritage.held.coffret': 'Il tuo Scrigno',
  'game.fiche.heritage.held.coffre': 'Il tuo Forziere',
  'game.fiche.heritage.held.tresor': 'Il tuo Tesoro',
  'game.fiche.heritage.held.reserve': 'La tua Riserva',
  'game.fiche.heritage.opens.bourse': 'la Borsa si apre a {count}',
  'game.fiche.heritage.opens.escarcelle': 'la Scarsella si apre a {count}',
  'game.fiche.heritage.opens.coffret': 'lo Scrigno si apre a {count}',
  'game.fiche.heritage.opens.coffre': 'il Forziere si apre a {count}',
  'game.fiche.heritage.opens.tresor': 'il Tesoro si apre a {count}',
  'game.fiche.heritage.opens.reserve': 'la Riserva si apre a {count}',
  'game.fiche.heritage.minted.one': '{count} coniata da sempre',
  'game.fiche.heritage.minted.other': '{count} coniate da sempre',
  'game.fiche.mint.sentence': 'Fissa {price} della tua luce, che ne conta {held}.',
  'game.fiche.mint.missing': 'Ne mancano ancora {missing} per coniarla.',
  'game.fiche.mint.mee.next_gold': 'La n. {number} sarà d’oro.',
  'game.fiche.mint.mee.next_prism': 'La n. {number} sarà di prisma.',
  'game.fiche.mint.mee.gold': 'Questa sarà d’oro: i tuoi antenati la vedranno.',
  'game.fiche.mint.mee.prism': 'Questa sarà di prisma: tutte le lingue vi brilleranno.',
  'game.fiche.mint.mee.wait': 'Ancora un po’ di luce, e coniamo insieme.',
} as const satisfies GameFicheCatalog;

export default it;
