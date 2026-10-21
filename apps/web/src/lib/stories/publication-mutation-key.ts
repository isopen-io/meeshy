import { newClientMutationId } from '@/lib/api/client-message-id';

/**
 * **LA CLÉ D'IDEMPOTENCE D'UNE PUBLICATION** (#10316) — `POST /posts` est
 * enveloppé par le journal de mutation (`withMutationVerdict`, `createPost`,
 * `routes/posts/core.ts`) : une requête qui porte une clé DÉJÀ vue rend la
 * publication déjà écrite au lieu d'en écrire une seconde.
 *
 * Le studio peut rejouer une publication — au retour du réseau, ou après une
 * annulation dont la requête avait en fait ABOUTI côté serveur. Le trousseau
 * rend donc la MÊME clé pour le MÊME contenu, et une clé neuve dès qu'un champ
 * change : un contenu retouché n'est jamais servi sous l'ancien.
 *
 * Il vit le temps du composer (jamais `localStorage`) — c'est le rejeu au sein
 * d'une même composition qu'il garde.
 */
export type PublicationKeyring = {
  readonly keyFor: (fingerprint: string) => string;
};

export function createPublicationKeyring(mint: () => string = newClientMutationId): PublicationKeyring {
  const keys = new Map<string, string>();
  return {
    keyFor: (fingerprint) => {
      const known = keys.get(fingerprint);
      if (known !== undefined) return known;
      const minted = mint();
      keys.set(fingerprint, minted);
      return minted;
    },
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}

/** L'empreinte d'un corps de publication — indépendante de l'ordre des clés. */
export function publicationFingerprint(body: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(canonical(body));
}
