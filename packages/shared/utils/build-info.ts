/**
 * Métadonnées du build gravées dans l'image, remontées au runtime.
 *
 * Le Dockerfile pose déjà `org.opencontainers.image.revision` depuis le
 * build-arg `VCS_REF`, que `.github/workflows/docker.yml` alimente avec
 * `github.sha`. Un label OCI n'est cependant lisible que par `docker inspect`
 * sur la machine hôte : depuis l'extérieur, identifier le code en production
 * supposait de corréler l'uptime du container avec l'horodatage des tags
 * `sha-<short>` du registre — une inférence, jamais une lecture.
 *
 * Ces valeurs sont donc aussi exportées en variables d'environnement dans le
 * stage `runner`, et exposées par `/health` et `/info`.
 */
export type BuildInfo = {
  /** SHA complet du commit, tel que gravé. `null` si l'image ne le porte pas. */
  readonly commit: string | null;
  /** Sept premiers caractères — la forme qui indexe les tags `sha-<short>`. */
  readonly commitShort: string | null;
  /** Date de build ISO-8601, ou `null`. */
  readonly builtAt: string | null;
};

const SHORT_SHA_LENGTH = 7;

const readNonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Aucune valeur de repli n'est fabriquée : une image sans commit gravé rend
 * `null`, pas `'unknown'` ni `'dev'`. Un repli plausible rendrait une lecture
 * morte indiscernable d'une lecture réussie — exactement le défaut corrigé ici.
 */
export function resolveBuildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  const commit = readNonEmpty(env.GIT_COMMIT);

  return {
    commit,
    commitShort: commit ? commit.slice(0, SHORT_SHA_LENGTH) : null,
    builtAt: readNonEmpty(env.BUILD_DATE)
  };
}
