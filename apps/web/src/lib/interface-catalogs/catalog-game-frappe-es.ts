import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const es = {
  'game.frappe.light': 'tu luz',
  'game.frappe.tchak': '¡Clac!',
  'game.frappe.tchak_final': '¡CLAC!',
  'game.frappe.ancestors.title': 'Tus ancestros se manifiestan',
  'game.frappe.ancestors.gold': 'cada centésima moneda lleva su luz',
  'game.frappe.ancestors.prism': 'cada milésima moneda reúne todos los idiomas',
  'game.frappe.say.silver': 'La n.º {number} se une a tu Legado.',
  'game.frappe.say.gold': 'La n.º {number} es de oro. Tus ancestros la vieron.',
  'game.frappe.say.prism': 'La n.º {number} es de prisma: todos los idiomas brillan en ella.',
  'game.frappe.glory': '+{glory} de gloria',
  'game.frappe.refused.shadow': 'Una sombra cubre tu luz. Tus próximas chispas la disiparán, y acuñaremos.',
  'game.frappe.refused.locked': 'Tu Legado espera un rango más alto. Tu gloria lo abrirá, y acuñaremos.',
  'game.frappe.refused.light': 'Tu luz aún no alcanza. Tus próximas chispas la alimentarán.',
  'game.frappe.refused.offline': 'Sin conexión por ahora. En cuanto vuelva, acuñamos.',
  'game.frappe.refused.unknown': 'La acuñación no se hizo. No se pierde nada: tu luz está intacta.',
  'game.frappe.skip': 'Toca para saltar',
} as const satisfies GameFrappeCatalog;

export default es;
