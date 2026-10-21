import type { GameFicheCatalog } from '@/lib/i18n-game-catalog';

/** LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11178) — `game.fiche.light.*`, `game.fiche.heritage.*`, `game.fiche.mint.*`. Mêmes clés et mêmes paramètres que le français. */
const ar = {
  'game.fiche.light.label': 'نورك',
  'game.fiche.light.to_heritage': 'افتح إرثك',
  'game.fiche.heritage.held.none': 'إرثك',
  'game.fiche.heritage.held.bourse': 'كيسك',
  'game.fiche.heritage.held.escarcelle': 'جرابك',
  'game.fiche.heritage.held.coffret': 'صندوقك الصغير',
  'game.fiche.heritage.held.coffre': 'صندوقك',
  'game.fiche.heritage.held.tresor': 'كنز إرثك',
  'game.fiche.heritage.held.reserve': 'احتياطيّك',
  'game.fiche.heritage.opens.bourse': 'يُفتح الكيس عند \u2066{count}\u2069',
  'game.fiche.heritage.opens.escarcelle': 'يُفتح الجراب عند \u2066{count}\u2069',
  'game.fiche.heritage.opens.coffret': 'يُفتح الصندوق الصغير عند \u2066{count}\u2069',
  'game.fiche.heritage.opens.coffre': 'يُفتح الصندوق عند \u2066{count}\u2069',
  'game.fiche.heritage.opens.tresor': 'يُفتح الكنز عند \u2066{count}\u2069',
  'game.fiche.heritage.opens.reserve': 'يُفتح الاحتياطي عند \u2066{count}\u2069',
  'game.fiche.heritage.minted.one': '\u2066{count}\u2069 سُكّت منذ البداية',
  'game.fiche.heritage.minted.other': '\u2066{count}\u2069 سُكّت منذ البداية',
  'game.fiche.mint.sentence': 'تُثبّت \u2066{price}\u2069 من نورك، الذي يبلغ \u2066{held}\u2069.',
  'game.fiche.mint.missing': 'ما زال ينقص \u2066{missing}\u2069 لسكّها.',
  'game.fiche.mint.mee.next_gold': 'Meesh رقم \u2066{number}\u2069 ستكون ذهبية.',
  'game.fiche.mint.mee.next_prism': 'Meesh رقم \u2066{number}\u2069 ستكون موشورية.',
  'game.fiche.mint.mee.gold': 'هذه ستكون ذهبية: سيراها أجدادك.',
  'game.fiche.mint.mee.prism': 'هذه ستكون موشورية: كل اللغات ستسطع فيها.',
  'game.fiche.mint.mee.wait': 'قليل من النور بعد، ونسكّ معًا.',
} as const satisfies GameFicheCatalog;

export default ar;
