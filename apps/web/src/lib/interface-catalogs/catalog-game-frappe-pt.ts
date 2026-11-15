import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const pt = {
  'game.frappe.light': 'sua luz',
  'game.frappe.tchak': 'Tchac!',
  'game.frappe.tchak_final': 'TCHAC!',
  'game.frappe.ancestors.title': 'Seus ancestrais se manifestam',
  'game.frappe.ancestors.gold': 'cada centésima moeda leva a luz deles',
  'game.frappe.ancestors.prism': 'cada milésima moeda reúne todos os idiomas',
  'game.frappe.say.silver': 'A nº {number} entra na sua Herança.',
  'game.frappe.say.gold': 'A nº {number} é de ouro. Seus ancestrais a viram.',
  'game.frappe.say.prism': 'A nº {number} é de prisma: todos os idiomas brilham nela.',
  'game.frappe.glory': '+{glory} de glória',
  'game.frappe.refused.shadow': 'Uma sombra cobre sua luz. Suas próximas faíscas vão dissipá-la, e a gente cunha.',
  'game.frappe.refused.locked': 'Sua Herança espera um título mais alto. Sua glória vai abri-la, e a gente cunha.',
  'game.frappe.refused.light': 'Sua luz ainda não basta. Suas próximas faíscas vão alimentá-la.',
  'game.frappe.refused.offline': 'Sem conexão por enquanto. Assim que ela voltar, a gente cunha.',
  'game.frappe.refused.unknown': 'A cunhagem não aconteceu. Nada se perde: sua luz está intacta.',
  'game.frappe.skip': 'Toque para pular',
} as const satisfies GameFrappeCatalog;

export default pt;
