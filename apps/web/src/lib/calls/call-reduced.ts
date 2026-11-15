import { reducedCaption } from './call-header';

/**
 * **CE QUE L'APPEL RÉDUIT DIT DE LUI** (P18.2, P18.3 ; #18223) — miroir de `CallReducedRule.label` et
 * `CallReducedRule.colorKey` (iOS, #18464), mêmes vecteurs ; la clé de couleur est celle d'Android
 * `CallTileRim.peerAvatar` (#18449). Module à part : seul l'appel réduit le lit, l'écran d'appel
 * (`budgets.json` › `call_overlay`) ne le paie pas.
 */

const meaningful = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export type ReducedLabelInput = { readonly title: string | null; readonly duration: string; readonly connected: boolean; readonly unknown: string };

/** « nom · durée » une fois l'appel établi ; avant, le nom seul (la phase se dit autrement), jamais une durée de « 0:00 ». */
export function reducedLabel({ title, duration, connected, unknown }: ReducedLabelInput): string {
  return connected ? reducedCaption(title, duration) : (title ?? unknown);
}

/** La clé de la couleur de l'autre : son identifiant, sinon son nom, sur la MÊME palette ; sans l'un ni l'autre, aucune couleur inventée. */
export function reducedColorKey({ peerId, peerName }: { readonly peerId: string | null | undefined; readonly peerName: string | null | undefined }): string | null {
  return meaningful(peerId) ?? meaningful(peerName);
}
