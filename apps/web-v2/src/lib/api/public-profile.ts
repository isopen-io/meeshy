import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU PROFIL PUBLIC** (#7032) — `GET /api/v1/directory/people/:handle`
 * (`services/gateway/src/routes/users/public-profile.ts`, `servirProfilPublic`).
 *
 * C'est l'adresse CANONIQUE : `GET /users/:id`, `GET /users/id/:id` et
 * `GET /u/:username` en sont des alias que le serveur garde montés « tant que
 * des versions iOS installées les appellent » (doc-comment de la route). Un
 * client NEUF ne s'inscrit pas sur la liste des appelants qui retardent leur
 * retrait — même arbitrage que `users-search.ts` face à `/users/search`.
 *
 * `handle` accepte un identifiant OU un pseudo, et la comparaison de pseudo
 * est INSENSIBLE À LA CASSE côté serveur (`{ username: { equals: handle, mode:
 * 'insensitive' } }`) : un `@Alice` écrit dans un message résout la même
 * personne que `@alice`.
 *
 * **CE QUI EST DÉCODÉ EST CE QUI S'AFFICHE.** La charge servie est déjà
 * projetée par `buildPublicProfile` (ni e-mail, ni téléphone), mais le cache
 * de requêtes de la v2 est persisté sur le disque du navigateur
 * (`query-client.ts`) : ce module n'y laisse entrer que l'identité visible.
 * **La PRÉSENCE en est exclue en particulier** — `isOnline` et `lastActiveAt`
 * ne sont servis qu'à un ami accepté (loi `resolvePresenceVisibility`), et le
 * client ne peint jamais ce qu'on ne lui a pas servi : ne pas les décoder rend
 * impossible d'en fabriquer un point vert par inadvertance.
 */

export type PublicProfileDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type PublicProfile = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly bio: string | null;
};

export const publicProfileQueryKey = (handle: string) => ['directory', 'people', handle.toLowerCase()] as const;

const optionalText = z.optional(z.nullable(z.string()));

const WireProfile = z.object({
  id: z.string().check(z.minLength(1)),
  username: z.string().check(z.minLength(1)),
  displayName: optionalText,
  avatar: optionalText,
  bio: optionalText,
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

/** `null` quand la charge n'a pas la forme attendue — fail-closed : un écran
 * qui ne peut pas dire QUI il montre ne montre personne. */
export function decodePublicProfile(raw: unknown): PublicProfile | null {
  const parsed = WireProfile.safeParse(raw);
  if (!parsed.success) return null;
  const { id, username, displayName, avatar, bio } = parsed.data;
  return {
    id,
    username,
    displayName: textOrNull(displayName),
    avatar: textOrNull(avatar),
    bio: textOrNull(bio),
  };
}

export async function loadPublicProfile(
  params: PublicProfileDeps & { readonly handle: string; readonly signal?: AbortSignal },
): Promise<ApiResult<PublicProfile>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixturePublicProfile } = await import('./fixtures-rich-text');
    const found = fixturePublicProfile(params.handle);
    return found === null
      ? { ok: false, status: 404, error: 'User not found', code: 'NOT_FOUND' }
      : { ok: true, data: found };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/directory/people/${encodeURIComponent(params.handle)}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const profile = decodePublicProfile(result.data);
  return profile === null
    ? { ok: false, status: 404, error: 'User not found', code: 'NOT_FOUND' }
    : { ...result, data: profile };
}

/** CINQ MINUTES — une identité publique (pseudo, nom, avatar, bio) ne change
 * pas d'une minute à l'autre, et rien de vivant n'est décodé ici. */
export const PUBLIC_PROFILE_STALE_TIME = 5 * 60_000;

export function publicProfileQueryOptions(deps: PublicProfileDeps & { readonly handle: string }) {
  return {
    queryKey: publicProfileQueryKey(deps.handle),
    staleTime: PUBLIC_PROFILE_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPublicProfile({ ...deps, signal }).then(unwrap),
  };
}
