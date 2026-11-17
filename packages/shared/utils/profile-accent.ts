/**
 * LA COULEUR D'ACCENT DE LA VITRINE, choisie par la personne (#19201, chantier #18857).
 *
 * Une liste FERMÉE, celle des pastilles de la planche (`Moi-Edition`) : jamais du texte libre,
 * jamais un hex quelconque. `null` veut dire « automatique » — le client calcule l'accent comme
 * il le fait aujourd'hui. Chaque teinte porte son ENCRE pour une surface claire et pour une
 * surface sombre (contraste 4.5:1 mesuré par le témoin), de sorte qu'aucun client n'ait à
 * deviner comment écrire lisiblement dans la couleur choisie.
 *
 * Le cercle est PUBLIC (Sys-Matrice « Couleur d'accent choisie ») : aucune loi d'accès à
 * interroger, mais un profil ne part toujours que vers un lecteur qui a un compte (#10205).
 */
import { z } from 'zod';

export type ProfileAccentTone = {
  readonly key: string;
  readonly hex: string;
  readonly inkOnLight: string;
  readonly inkOnDark: string;
};

export const PROFILE_ACCENT_COLORS: readonly ProfileAccentTone[] = [
  { key: 'violet', hex: '#A855F7', inkOnLight: '#994DE1', inkOnDark: '#A855F7' },
  { key: 'turquoise', hex: '#4ECDC4', inkOnLight: '#31817B', inkOnDark: '#4ECDC4' },
  { key: 'coral', hex: '#FF6B6B', inkOnLight: '#BF5050', inkOnDark: '#FF6B6B' },
  { key: 'amber', hex: '#F8B500', inkOnLight: '#976E00', inkOnDark: '#F8B500' },
  { key: 'blue', hex: '#3498DB', inkOnLight: '#2A7AAF', inkOnDark: '#3498DB' },
  { key: 'green', hex: '#2ECC71', inkOnLight: '#1E8549', inkOnDark: '#2ECC71' },
  { key: 'raspberry', hex: '#FF2E63', inkOnLight: '#DE2856', inkOnDark: '#FF2E63' },
];

export const PROFILE_ACCENT_HEXES: readonly string[] = PROFILE_ACCENT_COLORS.map((tone) => tone.hex);

const ACCEPTED = new Set(PROFILE_ACCENT_HEXES);

/** La forme canonique (`#RRGGBB` majuscule) d'une teinte de la liste, ou `null`. */
export function parseProfileAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const canonical = value.trim().toUpperCase();
  return ACCEPTED.has(canonical) ? canonical : null;
}

/** Ce qui part vers un lecteur : une teinte de la liste, sinon `null` (automatique). */
export const servedProfileAccentColor = (stored: string | null | undefined): string | null =>
  parseProfileAccentColor(stored);

/** Le champ du `PATCH /users/me` : une teinte de la liste (canonisée) ou `null`. */
export const profileAccentColorInput = z.union([
  z.string().transform((value, ctx) => {
    const canonical = parseProfileAccentColor(value);
    if (canonical !== null) return canonical;
    ctx.addIssue({ code: 'custom', message: "La couleur d'accent doit être une teinte de la liste" });
    return z.NEVER;
  }),
  z.null(),
]);
