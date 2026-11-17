/**
 * LES HÔTES QUI SERVENT LES MÉDIAS DE MEESHY (#16809).
 *
 * Une image d'identité — avatar ou bannière d'un profil, d'une communauté —
 * s'affiche chez TOUS ses lecteurs, non-membres compris via la découverte. Une
 * adresse absolue vers un hôte choisi par celui qui la pose ferait livrer à cet
 * hôte l'IP et le navigateur de chacun d'eux : un pixel de suivi. Une telle
 * adresse n'est donc admise que sur un hôte de CE déploiement.
 *
 * La liste vient de la configuration, jamais d'un nom écrit dans un service :
 * `PUBLIC_URL` (ce que les composes posent), `API_PUBLIC_URL`
 * (`publicMediaUrlFromEnv`), `BACKEND_URL`, et `MEESHY_MEDIA_HOSTS` (liste
 * séparée par des virgules, pour un hôte de médias distinct). `gate.meeshy.me`
 * y est toujours : 1 600 références de médias le gravent en base (mesuré le
 * 2026-09-18, `mediaUrlNormalization.ts`), et c'est un hôte Meeshy partout.
 *
 * L'hôte se compare à la forme que `URL` analyse (`host`, port compris), ce qui
 * déjoue `https://gate.meeshy.me@evil.test/…` ; une adresse qui porte des
 * identifiants est refusée même vers un hôte Meeshy.
 */
const ALWAYS_TRUSTED = 'gate.meeshy.me';
const URL_VARIABLES = ['PUBLIC_URL', 'API_PUBLIC_URL', 'BACKEND_URL'] as const;

type MediaHostEnv = Readonly<Record<string, string | undefined>>;

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function meeshyMediaHostsFromEnv(env: MediaHostEnv = process.env): ReadonlySet<string> {
  const fromUrls = URL_VARIABLES.map((name) => env[name])
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map(hostOf);
  const listed = (env.MEESHY_MEDIA_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase());
  return new Set(
    [ALWAYS_TRUSTED, ...fromUrls, ...listed].filter((host): host is string => typeof host === 'string' && host !== ''),
  );
}

export function isMeeshyMediaUrl(value: string, hosts: ReadonlySet<string>): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username !== '' || url.password !== '') return false;
    return hosts.has(url.host.toLowerCase());
  } catch {
    return false;
  }
}

export function isAbsoluteHttpReference(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}
