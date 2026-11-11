/**
 * **LE PIED DES SOUS-TITRES** (#17343) — ce que la dernière phrase dit de sa
 * traduction, à côté du bouton « Journal ». Son module à lui : seul le chunk des
 * sous-titres l'importe (`budgets.json` › `call_overlay.dynamic_only`).
 */

export type FooterLine = { readonly languages: string | null; readonly event: boolean };

/** Le pied des sous-titres : la paire de langues de la dernière phrase TRADUITE, qui dit comment voir l'original. Une capture n'est pas une parole. */
export function callCaptionsFooter(lines: readonly FooterLine[]): string | null {
  return lines.findLast((line) => !line.event && line.languages !== null)?.languages ?? null;
}
