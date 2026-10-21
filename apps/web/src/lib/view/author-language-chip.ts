/**
 * LA PASTILLE DE LANGUE SUR L'AVATAR DE 22 PX (#10004, note « look ») — elle
 * annonce que l'auteur écrit dans une AUTRE langue que celle que la rangée
 * sert : la langue d'origine, en capitales, quand la rangée sert une
 * traduction. La langue servie est celle que la rangée a DÉJÀ résolue
 * (`servedRowLanguage`, texte puis pièce) — aucune seconde descente du Prisme.
 */
const baseOf = (code: string): string => code.trim().toLowerCase().split(/[-_]/)[0] ?? '';

export const authorLanguageChip = ({
  originalLanguage,
  servedLanguage,
  isMine,
}: {
  readonly originalLanguage: string | undefined;
  readonly servedLanguage: string;
  readonly isMine: boolean;
}): string | null => {
  if (isMine || originalLanguage === undefined) return null;
  const original = baseOf(originalLanguage);
  if (!/^[a-z]{2,3}$/.test(original)) return null;
  return original === baseOf(servedLanguage) ? null : original.toUpperCase();
};
