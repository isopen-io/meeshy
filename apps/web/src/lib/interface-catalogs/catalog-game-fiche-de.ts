import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const de = {
  'game.fiche.light.label': 'Dein Licht',
  'game.fiche.light.to_heritage': 'Dein Erbe öffnen',
  'game.fiche.heritage.held.none': 'Dein Erbe',
  'game.fiche.heritage.held.bourse': 'Deine Börse',
  'game.fiche.heritage.held.escarcelle': 'Dein Beutel',
  'game.fiche.heritage.held.coffret': 'Deine Schatulle',
  'game.fiche.heritage.held.coffre': 'Deine Truhe',
  'game.fiche.heritage.held.tresor': 'Dein Schatz',
  'game.fiche.heritage.held.reserve': 'Deine Reserve',
  'game.fiche.heritage.opens.bourse': 'die Börse öffnet sich bei {count}',
  'game.fiche.heritage.opens.escarcelle': 'der Beutel öffnet sich bei {count}',
  'game.fiche.heritage.opens.coffret': 'die Schatulle öffnet sich bei {count}',
  'game.fiche.heritage.opens.coffre': 'die Truhe öffnet sich bei {count}',
  'game.fiche.heritage.opens.tresor': 'der Schatz öffnet sich bei {count}',
  'game.fiche.heritage.opens.reserve': 'die Reserve öffnet sich bei {count}',
  'game.fiche.heritage.minted.one': '{count} seit jeher geprägt',
  'game.fiche.heritage.minted.other': '{count} seit jeher geprägt',
  'game.fiche.mint.sentence': 'Sie hält {price} deines Lichts fest, das {held} zählt.',
  'game.fiche.mint.missing': 'Es fehlen noch {missing}, um sie zu prägen.',
  'game.fiche.mint.mee.next_gold': 'Nr. {number} wird aus Gold sein.',
  'game.fiche.mint.mee.next_prism': 'Nr. {number} wird aus Prisma sein.',
  'game.fiche.mint.mee.gold': 'Diese wird aus Gold sein: Deine Ahnen werden sie sehen.',
  'game.fiche.mint.mee.prism': 'Diese wird aus Prisma sein: Alle Sprachen werden darin leuchten.',
  'game.fiche.mint.mee.wait': 'Noch ein wenig Licht, dann prägen wir zusammen.',
} as const satisfies GameFicheCatalog;

export default de;
