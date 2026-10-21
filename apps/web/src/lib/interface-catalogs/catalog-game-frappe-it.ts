import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const it = {
  'game.frappe.light': 'la tua luce',
  'game.frappe.tchak': 'Clac!',
  'game.frappe.tchak_final': 'CLAC!',
  'game.frappe.ancestors.title': 'I tuoi antenati si manifestano',
  'game.frappe.ancestors.gold': 'ogni centesima moneta porta la loro luce',
  'game.frappe.ancestors.prism': 'ogni millesima moneta riunisce tutte le lingue',
  'game.frappe.say.silver': 'La n. {number} entra nella tua Eredità.',
  'game.frappe.say.gold': 'La n. {number} è d’oro. I tuoi antenati l’hanno vista.',
  'game.frappe.say.prism': 'La n. {number} è di prisma: tutte le lingue vi brillano.',
  'game.frappe.glory': '+{glory} di gloria',
  'game.frappe.refused.shadow': 'Un’ombra vela la tua luce. Le tue prossime scintille la dissiperanno, e conieremo.',
  'game.frappe.refused.locked': 'La tua Eredità attende un rango più alto. La tua gloria la aprirà, e conieremo.',
  'game.frappe.refused.light': 'La tua luce non basta ancora. Le tue prossime scintille la nutriranno.',
  'game.frappe.refused.offline': 'Nessuna connessione per ora. Appena torna, coniamo.',
  'game.frappe.refused.unknown': 'Il conio non è avvenuto. Non si perde nulla: la tua luce è intatta.',
  'game.frappe.skip': 'Tocca per saltare',
} as const satisfies GameFrappeCatalog;

export default it;
