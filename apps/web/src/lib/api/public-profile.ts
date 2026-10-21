import * as z from 'zod/mini';
import * as directoryEndpoints from '@meeshy/shared/api/endpoints/directory';

import type { ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { readProfileDecor } from './profile-decor';

/**
 * **LE PORT DU PROFIL PUBLIC** (#7032, étendu par #7083) —
 * `GET directory.peopleByHandle?expand=relation,presence` et, en parallèle,
 * `?expand=stats` (`services/gateway/src/routes/directory/person.ts:170`,
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
 * **DEUX LECTURES EN PARALLÈLE, JAMAIS EN SÉRIE** (profil lent dans la coque
 * Android). La v3.1 demandait `stats,relation,presence` en UN aller-retour :
 * l'identité attendait alors les compteurs, qui sont le seul calcul coûteux
 * de la route (`computeUserStats`, neuf agrégations dont trois sur la
 * collection `Message`). Mesuré en production : plus de 9 s de squelette sur
 * `/u/jcnm`, alors que le nom, l'avatar et la relation tiennent en deux
 * lectures indexées. La fiche pose désormais DEUX questions À LA MÊME ADRESSE,
 * parties dans le même tour : `expand=relation,presence` (ce qui peint la
 * fiche et arme les gestes) et `expand=stats` (ce qui remplit les compteurs,
 * `publicProfileStatsQueryOptions`). Aucune n'attend l'autre — ni un
 * identifiant que l'autre rendrait : toutes deux prennent le PSEUDO de
 * l'adresse. Une passerelle plus ancienne sert les deux à l'identique (la
 * route accepte toute combinaison d'`expand` depuis #4161).
 *
 * **CE QUI EST DÉCODÉ EST CE QUI S'AFFICHE.** La charge servie est déjà
 * projetée par `buildPublicProfile` (ni e-mail, ni téléphone), mais le cache
 * de requêtes de la v2 est persisté sur le disque du navigateur
 * (`query-client.ts`) : ce module n'y laisse entrer que ce que la fiche peint.
 * **La PRÉSENCE y entre telle que la passerelle l'a SERVIE, jamais au-delà**
 * (#9063) — `expand=presence` POSE la question, la loi
 * `resolvePresenceVisibility` y répond seule : ami accepté, soi ou ADMIN+, et
 * les réglages `showOnlineStatus` / `showLastSeen` de la personne regardée.
 * Masquée, elle arrive `null` et le décodeur rend `presence: null` — jamais un
 * « hors ligne » qu'on n'a pas mesuré. Elle voyage À CÔTÉ de l'identité, comme
 * `relation`, parce qu'elle répond à une autre question : qui la LIT.
 * `achievements` et `languages` ne sont pas décodés : aucune
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
  /** Le contour et la bannière de design équipés (#10632) ; absent = ancien serveur, rendu inchangé. */
  readonly decor?: ServedProfileDecor;
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
  /**
   * **L'IDENTIFIANT QUE LA FICHE DOIT ENVOYER** (#7122) — l'`id` de la ligne
   * `friendRequest` quand `relation` est en attente, `null` sinon.
   *
   * Il voyage à CÔTÉ de `relation` pour la même raison que `blockedByViewer` :
   * « une demande est en attente » et « voici sa ligne » sont deux questions,
   * et une seule d'elles survit à l'acceptation. Sans lui, « Accepter » /
   * « Refuser » / « Annuler » n'avaient rien à envoyer à
   * `PATCH /directory/friend-requests/:id` et l'écran devait charger le panier
   * correspondant pour retrouver la ligne — un aller-retour de plus, et trois
   * gestes désarmés le temps du vol.
   *
   * La passerelle ne l'élargit d'AUCUNE lecture : même `where`, même ligne,
   * une colonne de plus dans le `select` (`routes/directory/person.ts`). Un
   * identifiant de demande n'atteint donc que ses deux parties.
   */
  readonly relationRequestId: string | null;
  /** `null` = le serveur n'a rien servi (non-ami, présence masquée, passerelle
   * plus ancienne) : la fiche ne peint alors ni pastille ni date. */
  readonly presence: ServedPresence | null;
};

export type ServedPresence = {
  readonly isOnline: boolean;
  readonly lastActiveAt: string | null;
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

const decorOf = (raw: unknown): { readonly decor?: ServedProfileDecor } => {
  const decor = readProfileDecor(raw);
  return decor === undefined ? {} : { decor };
};

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
    ...decorOf(raw),
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

const servedDate = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

export function decodeServedPresence(wire: Readonly<Record<string, unknown>>): ServedPresence | null {
  const lastActiveAt = servedDate(wire.lastActiveAt);
  if (typeof wire.isOnline !== 'boolean' && lastActiveAt === null) return null;
  return { isOnline: wire.isOnline === true, lastActiveAt };
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
    /* Même idiome, même raison : un identifiant fabriqué enverrait un `PATCH`
       dans le vide. `null` ⇒ le geste n'est pas offert, il n'est pas grisé. */
    relationRequestId: typeof wire.relationRequestId === 'string' ? textOrNull(wire.relationRequestId) : null,
    presence: decodeServedPresence(wire),
  };
}

/** L'ordre des jetons est celui que le témoin lit. `presence` ne fait que
 * POSER la question (§ doc-comment du fichier). `stats` n'y est PLUS : les
 * compteurs ont leur propre lecture, partie en même temps
 * (`loadPublicProfileStats`), pour que la fiche ne les attende pas. */
const PUBLIC_PROFILE_EXPAND = 'relation,presence';

/** La seconde question, posée À LA MÊME ADRESSE et dans le même tour. */
const PUBLIC_PROFILE_STATS_EXPAND = 'stats';

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
    path: `${directoryEndpoints.peopleByHandle(params.handle)}?${query.toString()}`,
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

/**
 * **LES COMPTEURS, LUS À CÔTÉ DE LA FICHE** (profil lent dans la coque
 * Android) — `GET directory.peopleByHandle?expand=stats`, lancée dans le MÊME
 * tour que `loadPublicProfile` et jamais après elle : elle prend le pseudo de
 * l'adresse, pas l'identifiant que la fiche rendrait.
 *
 * Elle rend `null` quand la passerelle n'a servi aucun compteur — exactement
 * la loi de `decodePublicStats` : un jeu absent n'est pas un jeu à zéro. Seuls
 * les compteurs sont décodés ici : l'identité qui voyage avec eux est celle
 * que l'autre lecture a déjà rangée, et la lire deux fois ferait deux vérités.
 */
export async function loadPublicProfileStats(
  params: PublicProfileDeps & { readonly handle: string; readonly signal?: AbortSignal },
): Promise<ApiResult<PublicProfileStats | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixturePublicProfile } = await import('./fixtures-rich-text');
    const found = fixturePublicProfile(params.handle);
    return found === null
      ? { ok: false, status: 404, error: 'User not found', code: 'NOT_FOUND' }
      : { ok: true, data: found.stats };
  }
  const query = new URLSearchParams({ expand: PUBLIC_PROFILE_STATS_EXPAND });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${directoryEndpoints.peopleByHandle(params.handle)}?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const wire = result.data;
  return { ...result, data: wire !== null && typeof wire === 'object' ? decodePublicStats((wire as { stats?: unknown }).stats) : null };
}

/**
 * Une famille À PART (`people-stats`), jamais sous `PUBLIC_PROFILE_QUERY_PREFIX` :
 * `friend-actions.ts` lit chaque entrée de ce préfixe comme une
 * `PublicProfileView` pour y patcher la relation — un jeu de compteurs rangé
 * dessous y serait lu comme une fiche sans `profile`.
 */
export const PUBLIC_PROFILE_STATS_QUERY_PREFIX = ['directory', 'people-stats'] as const;

export const publicProfileStatsQueryKey = (handle: string) => [...PUBLIC_PROFILE_STATS_QUERY_PREFIX, handle.toLowerCase()] as const;

export function publicProfileStatsQueryOptions(deps: PublicProfileDeps & { readonly handle: string }) {
  return {
    queryKey: publicProfileStatsQueryKey(deps.handle),
    staleTime: PUBLIC_PROFILE_STALE_TIME,
    retry: false,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPublicProfileStats({ ...deps, signal }).then(unwrap),
  };
}
