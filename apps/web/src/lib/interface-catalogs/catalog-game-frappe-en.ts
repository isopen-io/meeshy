import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const en = {
  'game.frappe.light': 'your light',
  'game.frappe.tchak': 'Clack!',
  'game.frappe.tchak_final': 'CLACK!',
  'game.frappe.ancestors.title': 'Your ancestors send a sign',
  'game.frappe.ancestors.gold': 'every hundredth coin carries their light',
  'game.frappe.ancestors.prism': 'every thousandth coin unites every language',
  'game.frappe.say.silver': 'No. {number} joins your Legacy.',
  'game.frappe.say.gold': 'No. {number} is gold. Your ancestors saw it.',
  'game.frappe.say.prism': 'No. {number} is prism: every language shines in it.',
  'game.frappe.glory': '+{glory} glory',
  'game.frappe.refused.shadow': 'A shadow veils your light. Your next sparks will clear it, and we’ll mint.',
  'game.frappe.refused.locked': 'Your Legacy is waiting for a higher rank. Your glory will open it, and we’ll mint.',
  'game.frappe.refused.light': 'Your light isn’t enough yet. Your next sparks will feed it.',
  'game.frappe.refused.offline': 'No connection right now. As soon as it’s back, we mint.',
  'game.frappe.refused.unknown': 'The mint didn’t happen. Nothing is lost: your light is whole.',
  'game.frappe.skip': 'Tap to skip',
} as const satisfies GameFrappeCatalog;

export default en;
