import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const pt = {
  'game.fiche.light.label': 'Sua luz',
  'game.fiche.light.to_heritage': 'Abrir sua Herança',
  'game.fiche.heritage.held.none': 'Sua Herança',
  'game.fiche.heritage.held.bourse': 'Sua Bolsa',
  'game.fiche.heritage.held.escarcelle': 'Sua Escarcela',
  'game.fiche.heritage.held.coffret': 'Seu Cofrinho',
  'game.fiche.heritage.held.coffre': 'Seu Baú',
  'game.fiche.heritage.held.tresor': 'Seu Tesouro',
  'game.fiche.heritage.held.reserve': 'Sua Reserva',
  'game.fiche.heritage.opens.bourse': 'a Bolsa se abre com {count}',
  'game.fiche.heritage.opens.escarcelle': 'a Escarcela se abre com {count}',
  'game.fiche.heritage.opens.coffret': 'o Cofrinho se abre com {count}',
  'game.fiche.heritage.opens.coffre': 'o Baú se abre com {count}',
  'game.fiche.heritage.opens.tresor': 'o Tesouro se abre com {count}',
  'game.fiche.heritage.opens.reserve': 'a Reserva se abre com {count}',
  'game.fiche.heritage.minted.one': '{count} cunhada desde sempre',
  'game.fiche.heritage.minted.other': '{count} cunhadas desde sempre',
  'game.fiche.mint.sentence': 'Ela fixa {price} da sua luz, que tem {held}.',
  'game.fiche.mint.missing': 'Ainda faltam {missing} para cunhá-la.',
  'game.fiche.mint.mee.next_gold': 'A nº {number} será de ouro.',
  'game.fiche.mint.mee.next_prism': 'A nº {number} será de prisma.',
  'game.fiche.mint.mee.gold': 'Esta será de ouro: seus ancestrais vão vê-la.',
  'game.fiche.mint.mee.prism': 'Esta será de prisma: todos os idiomas vão brilhar nela.',
  'game.fiche.mint.mee.wait': 'Mais um pouco de luz, e cunhamos juntos.',
} as const satisfies GameFicheCatalog;

export default pt;
