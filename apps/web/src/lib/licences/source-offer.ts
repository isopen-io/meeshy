/**
 * L'OFFRE DE SOURCE de l'AGPL-3.0 (section 6), telle que l'écran Licences la
 * sert (#14628) : le dépôt public au commit EXACT du bundle (`__BUILD_COMMIT__`,
 * gravé depuis `VCS_REF`), ou le dépôt seul quand le build n'a gravé aucun
 * commit. Aucun commit n'est fabriqué : une valeur qui n'est pas un SHA-1
 * complet est tenue pour absente. Miroir de `SourceOffer` (iOS) et
 * `MeeshySourceOffer` (Android).
 *
 * Ingénierie de conformité, pas un avis juridique : la rédaction finale attend
 * l'avocat du projet (#11548).
 */
export const MEESHY_REPOSITORY_URL = 'https://github.com/isopen-io/meeshy';

export type SourceOffer = {
  readonly commit: string | null;
  readonly shortCommit: string | null;
  readonly url: string;
};

const SHA1 = /^[0-9a-f]{40}$/;

export const normalizedCommit = (raw: string | null | undefined): string | null => {
  const value = raw?.trim().toLowerCase() ?? '';
  return SHA1.test(value) ? value : null;
};

export const sourceOfferFor = (raw: string | null | undefined): SourceOffer => {
  const commit = normalizedCommit(raw);
  return {
    commit,
    shortCommit: commit === null ? null : commit.slice(0, 7),
    url: commit === null ? MEESHY_REPOSITORY_URL : `${MEESHY_REPOSITORY_URL}/tree/${commit}`,
  };
};
