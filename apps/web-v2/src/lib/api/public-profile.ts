import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU PROFIL PUBLIC** (#7032, étendu par #7083) —
 * `GET /api/v1/directory/people/:handle?expand=stats,relation`
 * (`services/gateway/src/routes/directory/person.ts:170`,
 * `routes/users/public-profile.ts#servirProfilPublic`).
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
 * **UN ALLER-RETOUR, PAS TROIS.** Le doc-comment de la route l'écrit : « un
 * écran de profil coûtait deux appels systématiques … jusqu'à trois selon
 * l'hôte iOS ; `?expand=stats` les fond en un ». `UserProfileViewModel`
 * (iOS) demande déjà `stats` ; la v3.1 demande `stats,relation` — l'identité,
 * les compteurs et l'état relationnel arrivent ensemble.
 *
 * **CE QUI EST DÉCODÉ EST CE QUI S'AFFICHE.** La charge servie est déjà
 * projetée par `buildPublicProfile` (ni e-mail, ni téléphone), mais le cache
 * de requêtes de la v2 est persisté sur le disque du navigateur
 * (`query-client.ts`) : ce module n'y laisse entrer que l'identité visible.
 * **La PRÉSENCE en est exclue en particulier** — `isOnline` et `lastActiveAt`
 * ne sont servis qu'à un ami accepté (loi `resolvePresenceVisibility`), et le
 * client ne peint jamais ce qu'on ne lui a pas servi : ne pas les décoder rend
 * impossible d'en fabriquer un point vert par inadvertance. **`expand` ne
 * demande donc JAMAIS `presence`**, et le décodeur ne le lirait pas s'il
 * arrivait. `achievements` et `languages` ne sont pas décodés non plus : aucune
 * surface ne les peint, et une donnée décodée sans être peinte n'entre dans le
 * cache persisté que pour l'alourdir.
 *
 * **UN COMPTEUR ABSENT N'EST PAS UN COMPTEUR À ZÉRO** (#7083). `servedUserStats`
 * (`services/gateway/src/routes/user-stats.ts:245-251`) SUPPRIME quatre
 * compteurs pour un lecteur tiers — `totalMessages`, `totalConversations`,
 * `totalTranslations`, `friendRequestsReceived` (`COMPTEURS_PRIVES`, `:220-225`).
 * iOS les décode en `Int` et la fiche d'autrui annonce « 0 Messages », une
 * valeur FAUSSE présentée comme mesurée. Ici chaque compteur est
 * `number | null`, et l'écran ne peint que ce qui est SERVI. Écart assumé avec
 * iOS, consigné dans `decisions.md`.
 */

export type PublicProfileDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type PublicProfile = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly bio: string | null;
  readonly createdAt: string | null;
};

/** Les onze compteurs de `UserStats`, moins `languages`/`achievements` que
 * personne ne peint. `null` = le serveur ne l'a pas servi (tiers) ; `0` = il
 * l'a servi et il vaut zéro. */
export type PublicProfileStats = {
  readonly languagesUsed: number | null;
  readonly memberDays: number | null;
  readonly postsCount: number | null;
  readonly reelsCount: number | null;
  readonly storiesCount: number | null;
  readonly totalMessages: number | null;
  readonly totalConversations: number | null;
  readonly totalTranslations: number | null;
  readonly friendRequestsReceived: number | null;
};

/** Les cinq valeurs que `relationAvec` sert (`person.ts:72-93`) — jamais une
 * sixième, et jamais « je ne sais pas » : un lecteur anonyme reçoit `none`. */
export const SERVED_RELATIONS = ['self', 'friend', 'pending_sent', 'pending_received', 'none'] as const;
export type ServedRelation = (typeof SERVED_RELATIONS)[number];

/**
 * **`blockedByViewer` EST UN CHAMP À CÔTÉ DE `relation`, JAMAIS UNE SIXIÈME
 * VALEUR DEDANS** (#7125) — bloquer quelqu'un n'efface pas la ligne d'amitié,
 * et la passerelle continue de servir `friend` ou `pending_sent` : c'est ce qui
 * permet à « Débloquer » de rendre la relation qu'on avait. Les deux dimensions
 * sont orthogonales, la charge les sépare, le décodeur aussi.
 *
 * La loi est DIRIGÉE — « ai-je bloqué cette personne », jamais
 * « sommes-nous bloqués » : `hasBlocked` côté passerelle
 * (`services/gateway/src/utils/blocking.ts`), et non `isBlockedBetween`, qui
 * sert l'interdiction de messagerie. Offrir « Débloquer » à quelqu'un qui s'est
 * fait bloquer serait un contrôle mort.
 */
export type PublicProfileView = {
  readonly profile: PublicProfile;
  readonly stats: PublicProfileStats | null;
  readonly relation: ServedRelation;
  readonly isSelf: boolean;
  readonly blockedByViewer: boolean;
};

/** Le PRÉFIXE de la famille — `friend-actions.ts` l'importe pour patcher
 * chaque entrée de profil qui porte l'identifiant touché, plutôt que de
 * recopier la chaîne et de diverger au premier renommage. */
export const PUBLIC_PROFILE_QUERY_PREFIX = ['directory', 'people'] as const;

export const publicProfileQueryKey = (handle: string) => [...PUBLIC_PROFILE_QUERY_PREFIX, handle.toLowerCase()] as const;

const optionalText = z.optional(z.nullable(z.string()));

const WireProfile = z.object({
  id: z.string().check(z.minLength(1)),
  username: z.string().check(z.minLength(1)),
  displayName: optionalText,
  avatar: optionalText,
  banner: optionalText,
  bio: optionalText,
  createdAt: optionalText,
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

/** `null` quand la charge n'a pas la forme attendue — fail-closed : un écran
 * qui ne peut pas dire QUI il montre ne montre personne. */
export function decodePublicProfile(raw: unknown): PublicProfile | null {
  const parsed = WireProfile.safeParse(raw);
  if (!parsed.success) return null;
  const { id, username, displayName, avatar, banner, bio, createdAt } = parsed.data;
  return {
    id,
    username,
    displayName: textOrNull(displayName),
    avatar: textOrNull(avatar),
    banner: textOrNull(banner),
    bio: textOrNull(bio),
    createdAt: textOrNull(createdAt),
  };
}

const STAT_KEYS = [
  'languagesUsed',
  'memberDays',
  'postsCount',
  'reelsCount',
  'storiesCount',
  'totalMessages',
  'totalConversations',
  'totalTranslations',
  'friendRequestsReceived',
] as const satisfies ReadonlyArray<keyof PublicProfileStats>;

const countOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** `null` quand le serveur n'a servi AUCUNE statistique (pas d'`expand`, ou un
 * objet illisible) — distinct d'un jeu servi dont certains compteurs manquent. */
export function decodePublicStats(raw: unknown): PublicProfileStats | null {
  if (raw === null || typeof raw !== 'object') return null;
  const wire = raw as Readonly<Record<string, unknown>>;
  return Object.fromEntries(STAT_KEYS.map((key) => [key, countOrNull(wire[key])])) as unknown as PublicProfileStats;
}

export function decodeServedRelation(raw: unknown): ServedRelation {
  return SERVED_RELATIONS.find((relation) => relation === raw) ?? 'none';
}

export function decodePublicProfileView(raw: unknown): PublicProfileView | null {
  const profile = decodePublicProfile(raw);
  if (profile === null) return null;
  const wire = raw as Readonly<Record<string, unknown>>;
  return {
    profile,
    stats: decodePublicStats(wire.stats),
    relation: decodeServedRelation(wire.relation),
    isSelf: wire.isSelf === true,
    /* Seul un `true` SERVI vaut un blocage — même idiome qu'`isSelf` juste
       au-dessus : un champ absent (passerelle plus ancienne) ou d'un autre
       type ne fabrique pas un état que personne n'a mesuré. */
    blockedByViewer: wire.blockedByViewer === true,
  };
}

/** L'ordre des jetons est celui que le témoin lit : `expand=stats,relation`,
 * et `presence` n'y entre jamais (§ doc-comment du fichier). */
const PUBLIC_PROFILE_EXPAND = 'stats,relation';

export async function loadPublicProfile(
  params: PublicProfileDeps & { readonly handle: string; readonly signal?: AbortSignal },
): Promise<ApiResult<PublicProfileView>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixturePublicProfile } = await import('./fixtures-rich-text');
    const found = fixturePublicProfile(params.handle);
    return found === null
      ? { ok: false, status: 404, error: 'User not found', code: 'NOT_FOUND' }
      : { ok: true, data: found };
  }
  const query = new URLSearchParams({ expand: PUBLIC_PROFILE_EXPAND });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/directory/people/${encodeURIComponent(params.handle)}?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const view = decodePublicProfileView(result.data);
  return view === null
    ? { ok: false, status: 404, error: 'User not found', code: 'NOT_FOUND' }
    : { ...result, data: view };
}

/**
 * SOIXANTE SECONDES — la fenêtre que la ROUTE déclare elle-même
 * (`Cache-Control: max-age=60, stale-while-revalidate=600`,
 * `routes/directory/person.ts:299-306`).
 *
 * Elle valait cinq minutes tant que la charge ne portait qu'une identité
 * publique, qui ne change pas d'une minute à l'autre. Elle porte désormais une
 * RELATION — qu'un geste d'un tiers modifie — et des COMPTEURS. S'aligner sur
 * ce que le serveur dit est la seule valeur qui ne mente pas ; le cache
 * persisté continue de peindre instantanément (Cache-First), seule la
 * revalidation SILENCIEUSE est plus fréquente.
 */
export const PUBLIC_PROFILE_STALE_TIME = 60_000;

export function publicProfileQueryOptions(deps: PublicProfileDeps & { readonly handle: string }) {
  return {
    queryKey: publicProfileQueryKey(deps.handle),
    staleTime: PUBLIC_PROFILE_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPublicProfile({ ...deps, signal }).then(unwrap),
  };
}
