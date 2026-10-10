/**
 * Ce qu'un client ANNONCE savoir lire — l'en-tête `X-Meeshy-Capabilities`,
 * une liste de jetons séparés par des virgules, insensible à la casse.
 *
 * Il sert la rétrocompatibilité (#9223) : un client publié avant un
 * changement de forme décode parfois sa réponse en objet STRICT (le web
 * décode l'état d'onboarding avec `z.strictObject`) et rejetterait une clé ou
 * une valeur d'énumération qu'il ne connaît pas. Une route qui élargit une
 * telle forme ne sert l'élargissement qu'au client qui annonce le jeton ;
 * sans l'en-tête, elle rend EXACTEMENT ce qu'elle rendait avant.
 *
 * CORS : `@fastify/cors` est monté sans `allowedHeaders` (`server.ts`), il
 * reflète donc `Access-Control-Request-Headers` — l'en-tête est admis par la
 * pré-vérification d'un client web d'une autre origine, comme
 * `X-Device-Locale`. Témoin : `client-capabilities-cors.test.ts`.
 */

export const CLIENT_CAPABILITIES_HEADER = 'x-meeshy-capabilities';

export const CLIENT_CAPABILITIES = {
  /** #9927 — l'étape `age` de l'onboarding et `viewerWriteRestriction` dans son état. */
  onboardingAge: 'onboarding-age',
} as const;

export type ClientCapability = (typeof CLIENT_CAPABILITIES)[keyof typeof CLIENT_CAPABILITIES];

export function announcesCapability(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  capability: ClientCapability
): boolean {
  const raw = headers[CLIENT_CAPABILITIES_HEADER];
  const value = typeof raw === 'string' ? raw : (raw ?? []).join(',');
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .includes(capability);
}
