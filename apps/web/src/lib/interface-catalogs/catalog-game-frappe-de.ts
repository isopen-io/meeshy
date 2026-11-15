import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const de = {
  'game.frappe.light': 'dein Licht',
  'game.frappe.tchak': 'Klack!',
  'game.frappe.tchak_final': 'KLACK!',
  'game.frappe.ancestors.title': 'Deine Ahnen zeigen sich',
  'game.frappe.ancestors.gold': 'jede hundertste Münze trägt ihr Licht',
  'game.frappe.ancestors.prism': 'jede tausendste Münze vereint alle Sprachen',
  'game.frappe.say.silver': 'Nr. {number} kommt in dein Erbe.',
  'game.frappe.say.gold': 'Nr. {number} ist aus Gold. Deine Ahnen haben sie gesehen.',
  'game.frappe.say.prism': 'Nr. {number} ist aus Prisma: Alle Sprachen leuchten darin.',
  'game.frappe.glory': '+{glory} Ruhm',
  'game.frappe.refused.shadow': 'Ein Schatten verhüllt dein Licht. Deine nächsten Funken vertreiben ihn, dann prägen wir.',
  'game.frappe.refused.locked': 'Dein Erbe wartet auf einen höheren Rang. Dein Ruhm öffnet es, dann prägen wir.',
  'game.frappe.refused.light': 'Dein Licht reicht noch nicht. Deine nächsten Funken nähren es.',
  'game.frappe.refused.offline': 'Gerade keine Verbindung. Sobald sie zurück ist, prägen wir.',
  'game.frappe.refused.unknown': 'Das Prägen hat nicht stattgefunden. Nichts ist verloren: Dein Licht ist unversehrt.',
  'game.frappe.skip': 'Tippen zum Überspringen',
} as const satisfies GameFrappeCatalog;

export default de;
