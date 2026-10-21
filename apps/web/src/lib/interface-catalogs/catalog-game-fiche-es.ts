import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const es = {
  'game.fiche.light.label': 'Tu luz',
  'game.fiche.light.to_heritage': 'Abrir tu Legado',
  'game.fiche.heritage.held.none': 'Tu Legado',
  'game.fiche.heritage.held.bourse': 'Tu Monedero',
  'game.fiche.heritage.held.escarcelle': 'Tu Escarcela',
  'game.fiche.heritage.held.coffret': 'Tu Cofrecillo',
  'game.fiche.heritage.held.coffre': 'Tu Cofre',
  'game.fiche.heritage.held.tresor': 'Tu Tesoro',
  'game.fiche.heritage.held.reserve': 'Tu Reserva',
  'game.fiche.heritage.opens.bourse': 'el Monedero se abre con {count}',
  'game.fiche.heritage.opens.escarcelle': 'la Escarcela se abre con {count}',
  'game.fiche.heritage.opens.coffret': 'el Cofrecillo se abre con {count}',
  'game.fiche.heritage.opens.coffre': 'el Cofre se abre con {count}',
  'game.fiche.heritage.opens.tresor': 'el Tesoro se abre con {count}',
  'game.fiche.heritage.opens.reserve': 'la Reserva se abre con {count}',
  'game.fiche.heritage.minted.one': '{count} acuñada desde siempre',
  'game.fiche.heritage.minted.other': '{count} acuñadas desde siempre',
  'game.fiche.mint.sentence': 'Fija {price} de tu luz, que cuenta {held}.',
  'game.fiche.mint.missing': 'Aún faltan {missing} para acuñarla.',
  'game.fiche.mint.mee.next_gold': 'La n.º {number} será de oro.',
  'game.fiche.mint.mee.next_prism': 'La n.º {number} será de prisma.',
  'game.fiche.mint.mee.gold': 'Esta será de oro: tus ancestros la verán.',
  'game.fiche.mint.mee.prism': 'Esta será de prisma: todos los idiomas brillarán en ella.',
  'game.fiche.mint.mee.wait': 'Un poco más de luz y acuñamos juntos.',
} as const satisfies GameFicheCatalog;

export default es;
