/**
 * **UNE COULEUR PAR PERSONNE DANS UN APPEL** (#8393) — le nom d'un locuteur
 * dans le bandeau des sous-titres et le liseré de sa vignette dans la grille
 * portent la MÊME couleur, dérivée de son identifiant : stable d'un rendu, d'un
 * appel et d'un appareil à l'autre, sans rien stocker.
 *
 * La palette est celle des « 300 » de la table iOS (bleu, rose, vert, ambre,
 * violet, fuchsia, cyan, orange) : claire, pour se LIRE sur le verre d'appel
 * sombre — chaque teinte y tient AA, mesurée par `call-speaker-color.test.ts`
 * contre le pire cas de `glass-call-prominent` (`styles/glass.css`). Ma propre
 * couleur est le blanc, hors palette : mes lignes et ma vignette se
 * reconnaissent sans voler la teinte d'un autre.
 */

export const SPEAKER_PALETTE: readonly string[] = ['#93c5fd', '#fca5a5', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74'];

export const SELF_SPEAKER_COLOR = '#ffffff';

const hash = (id: string): number => [...id].reduce((acc, char) => (Math.imul(acc, 31) + (char.codePointAt(0) ?? 0)) >>> 0, 7);

export function speakerColor(userId: string): string {
  return SPEAKER_PALETTE[hash(userId) % SPEAKER_PALETTE.length] ?? SELF_SPEAKER_COLOR;
}
