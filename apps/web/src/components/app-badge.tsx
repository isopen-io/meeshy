import { useAppBadge } from '@/lib/view/use-app-badge';

/**
 * **LE BADGE, EN DEHORS DU SOCLE** (W4, #7221) — un composant qui ne peint
 * RIEN : il n'existe que pour porter `useAppBadge` dans un chunk CHARGÉ À LA
 * DEMANDE, quatrième exception à la minceur de la coquille et pour la raison
 * qui gouverne les trois autres (`shell.tsx`).
 *
 * `useAppBadge` lit le cache des conversations (`lib/api/query.ts`), un module
 * carrefour qui atteint les conversations, le fil, le flux, les stories, les
 * commentaires et les réactions. L'importer STATIQUEMENT depuis la coquille
 * faisait passer la première peinture de **49,11 Ko en 10 requêtes à 95,84 Ko
 * en 29 requêtes** (mesuré, `scripts/measure-weight.mjs`) — au-dessus du
 * plafond de 90 Ko de `budgets.json › first_paint.kb`. Le nombre de
 * conversations non lues n'est pas un pixel du premier rendu : il peut
 * attendre un tour.
 */
export function AppBadge() {
  useAppBadge();
  return null;
}
