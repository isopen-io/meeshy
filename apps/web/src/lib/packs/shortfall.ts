import { spendPreview } from '@meeshy/shared/utils/game/spend';

import { formatUnlockCount } from './unlock-line';
import { unlockText } from './unlock-texts';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES MEESHES QUI MANQUENT POUR UN PACK** (#20527, tranche web de #17378) —
 * dits AVANT le geste, au lieu d'être découverts au refus de l'achat
 * (`INSUFFICIENT_MEESHES`). Le solde est celui que `GET /packs/shop` sert ;
 * l'écart, celui de `spendPreview`, la loi de tout geste qui dépense.
 *
 * `null` = rien à dire : solde inconnu (ancien serveur), pack possédé, gratuit
 * ou abordable. Le serveur reste juge : la ligne montre, « Acheter » reste.
 */
export function meeshShortfall(params: { readonly balance: number | null | undefined; readonly price: number | null; readonly owned: boolean }): number | null {
  const { balance, price, owned } = params;
  if (owned || price === null || typeof balance !== 'number') return null;
  const preview = spendPreview({ held: balance, cost: price });
  return preview.affordable ? null : preview.missing;
}

export const meeshShortfallLine = (language: InterfaceLanguage, missing: number): string =>
  missing === 1 ? unlockText(language, 'short_one') : unlockText(language, 'short_many', { missing: formatUnlockCount(language, missing) });

/** Le chemin vers les Meeshes : la frappe, dans la fiche de l'Héritage. */
export const meeshEarnLabel = (language: InterfaceLanguage): string => unlockText(language, 'earn');
