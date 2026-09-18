import * as z from 'zod/mini';

import { isSupportedLanguage } from '@meeshy/shared/utils/languages';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU PROFIL** (#6289) — miroir `UserService` (iOS,
 * `packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift`).
 *
 * - `GET /api/v1/me` — la SEULE lecture de soi (`services/gateway/src/routes/me/
 *   get-me.ts`, #4178), `{ user }` servi par `formatUserResponse`.
 * - `GET /api/v1/users/me/stats` — `computeUserStats` (`routes/user-stats.ts:257`).
 * - Les demandes reçues EN ATTENTE ne sont PLUS lues ici (#6363) : le profil
 *   compte le panier `received` de `friend-requests.ts` (`pendingRequestsOf`),
 *   le MÊME que l'onglet « Demandes » de la découverte et la pastille du
 *   barreau (#6321). Deux lectures parallèles auraient dit deux nombres, et
 *   une acceptation n'aurait fait baisser que l'un des deux.
 * - `PATCH /api/v1/users/me`, `/users/me/avatar`, `/users/me/banner`
 *   (`routes/users/profile-updates.ts:42,286,392`).
 *
 * **LA FRONTIÈRE EST VALIDÉE PAR ZOD, dans les deux sens.** À l'entrée, la
 * charge de soi est PROJETÉE : `formatUserResponse` sert vingt-sept champs,
 * dont l'adresse e-mail, le téléphone, l'IP et le lieu de la dernière
 * connexion, et les permissions. Le cache de requêtes est persisté dans le
 * `localStorage` (`query-client.ts`) : ce qui sort d'ici y est écrit. Les
 * contacts n'y entrent donc que MASQUÉS, et rien d'autre ne suit — la doctrine
 * de `session.ts` (règle 1), portée au cache. À la sortie, le corps d'un
 * `PATCH` est validé avec les bornes de `updateUserProfileSchema`
 * (`packages/shared/utils/validation.ts:316`) avant qu'un octet ne parte :
 * un refus se nomme sous son champ, sans aller-retour.
 *
 * `source` est résolue ICI, jamais dans l'écran (motif `notifications.ts`).
 */

export const MY_PROFILE_QUERY_KEY = ['me', 'profile'] as const;
export const MY_STATS_QUERY_KEY = ['me', 'stats'] as const;

export type ProfileDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type ProfileImageKind = 'avatar' | 'banner';

export type MaskedContact = { readonly masked: string; readonly verified: boolean };

export type MyProfile = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly bio: string;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly systemLanguage: string;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly email: MaskedContact | null;
  readonly phone: MaskedContact | null;
  readonly createdAt: string | null;
};

export type MyStats = {
  readonly totalMessages: number;
  readonly totalConversations: number;
  readonly totalTranslations: number;
  readonly languagesUsed: number;
  readonly memberDays: number;
  readonly friendRequestsReceived: number;
};


const MASK = '•';

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return MASK.repeat(3);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length === 1 ? `${MASK}@${domain}` : `${local.slice(0, 1)}${MASK.repeat(3)}@${domain}`;
}

/** L'indicatif et les deux derniers chiffres — un nombre FIXE de puces, pour
 * que le masque ne dise pas la longueur du numéro. */
export function maskPhone(phone: string): string {
  const compact = phone.replace(/[\s().-]/g, '');
  if (compact.length < 6) return MASK.repeat(4);
  return `${compact.slice(0, 3)} ${MASK.repeat(4)} ${compact.slice(-2)}`;
}

const optionalText = z.optional(z.nullable(z.string()));

const WireUser = z.object({
  id: z.string().check(z.minLength(1)),
  username: z.string().check(z.minLength(1)),
  displayName: optionalText,
  firstName: optionalText,
  lastName: optionalText,
  bio: optionalText,
  avatar: optionalText,
  banner: optionalText,
  email: optionalText,
  phoneNumber: optionalText,
  systemLanguage: optionalText,
  regionalLanguage: optionalText,
  customDestinationLanguage: optionalText,
  emailVerifiedAt: z.optional(z.unknown()),
  phoneVerifiedAt: z.optional(z.unknown()),
  createdAt: z.optional(z.unknown()),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const isStamped = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

export function decodeMyProfile(raw: unknown): MyProfile | null {
  const parsed = WireUser.safeParse(raw);
  if (!parsed.success) return null;
  const user = parsed.data;
  const email = textOrNull(user.email);
  const phone = textOrNull(user.phoneNumber);
  return {
    id: user.id,
    username: user.username,
    displayName: textOrNull(user.displayName),
    firstName: textOrNull(user.firstName),
    lastName: textOrNull(user.lastName),
    bio: user.bio ?? '',
    avatar: textOrNull(user.avatar),
    banner: textOrNull(user.banner),
    systemLanguage: textOrNull(user.systemLanguage) ?? 'fr',
    regionalLanguage: textOrNull(user.regionalLanguage),
    customDestinationLanguage: textOrNull(user.customDestinationLanguage),
    email: email === null ? null : { masked: maskEmail(email), verified: isStamped(user.emailVerifiedAt) },
    phone: phone === null ? null : { masked: maskPhone(phone), verified: isStamped(user.phoneVerifiedAt) },
    createdAt: typeof user.createdAt === 'string' ? user.createdAt : null,
  };
}

const counter = z.optional(z.unknown());

const WireStats = z.object({
  totalMessages: counter,
  totalConversations: counter,
  totalTranslations: counter,
  languagesUsed: counter,
  memberDays: counter,
  friendRequestsReceived: counter,
});

const countOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

export function decodeMyStats(raw: unknown): MyStats | null {
  const parsed = WireStats.safeParse(raw);
  if (!parsed.success) return null;
  const stats = parsed.data;
  return {
    totalMessages: countOf(stats.totalMessages),
    totalConversations: countOf(stats.totalConversations),
    totalTranslations: countOf(stats.totalTranslations),
    languagesUsed: countOf(stats.languagesUsed),
    memberDays: countOf(stats.memberDays),
    friendRequestsReceived: countOf(stats.friendRequestsReceived),
  };
}

/** `supportedLanguageCode` (`packages/shared/utils/validation-primitives.ts:91`). */
const supportedCode = z.string().check(z.minLength(2), z.maxLength(5), z.refine((code) => isSupportedLanguage(code)));

/** `customDestinationLanguageCode` (`validation-primitives.ts:120`) — la
 * passerelle n'exige pas une langue supportée au rang 3. */
const customCode = z.string().check(z.minLength(2), z.maxLength(6));

/** Plus strict que la passerelle, qui accepte un `displayName` vide : un nom
 * effacé par mégarde ferait afficher l'identifiant à tout le monde. iOS
 * n'envoie jamais un champ vide (`ProfileView.swift:850-852`). */
const filledText = z.string().check(z.refine((value) => value.trim().length > 0));

const ProfilePatchSchema = z.strictObject({
  displayName: z.optional(filledText),
  firstName: z.optional(filledText),
  lastName: z.optional(filledText),
  bio: z.optional(z.string().check(z.maxLength(500))),
  systemLanguage: z.optional(supportedCode),
  regionalLanguage: z.optional(z.union([z.literal(''), supportedCode])),
  customDestinationLanguage: z.optional(z.union([z.literal(''), customCode])),
});

/** `''` sur un rang secondaire = le RETIRER du Prisme (la passerelle écrit `null`). */
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const LANGUAGE_PATCH_KEYS = ['systemLanguage', 'regionalLanguage', 'customDestinationLanguage'] as const satisfies readonly (keyof ProfilePatch)[];

export type PatchValidation = { readonly ok: true; readonly patch: ProfilePatch } | { readonly ok: false; readonly field: string };

export function validateProfilePatch(raw: unknown): PatchValidation {
  const parsed = ProfilePatchSchema.safeParse(raw);
  if (parsed.success) return { ok: true, patch: parsed.data };
  const issue = parsed.error.issues[0];
  const key = issue === undefined ? undefined : issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[0];
  return { ok: false, field: typeof key === 'string' ? key : 'unknown' };
}

const ImageUrl = z.string().check(
  z.refine((url) => url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/api/')),
);

const Envelope = z.object({ user: z.unknown() });

function profileResult(result: ApiResult<unknown>): ApiResult<MyProfile> {
  if (!result.ok) return result;
  const envelope = Envelope.safeParse(result.data);
  const profile = envelope.success ? decodeMyProfile(envelope.data.user) : null;
  return profile === null ? { ok: false, status: 0, error: 'Profil illisible' } : { ok: true, data: profile };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadMyProfile(params: ProfileDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<MyProfile>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureMyProfile } = await import('./fixtures-profile');
    return { ok: true, data: fixtureMyProfile() };
  }
  return profileResult(await params.transport.request<unknown>({ method: 'GET', path: '/api/v1/me', ...withSignal(params.signal) }));
}

export async function loadMyStats(params: ProfileDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<MyStats>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureMyStats } = await import('./fixtures-profile');
    return { ok: true, data: fixtureMyStats() };
  }
  const result = await params.transport.request<unknown>({ method: 'GET', path: '/api/v1/users/me/stats', ...withSignal(params.signal) });
  if (!result.ok) return result;
  const stats = decodeMyStats(result.data);
  return stats === null ? { ok: false, status: 0, error: 'Statistiques illisibles' } : { ok: true, data: stats };
}

export async function patchMyProfile(deps: ProfileDeps, patch: ProfilePatch): Promise<ApiResult<MyProfile>> {
  const validated = validateProfilePatch(patch);
  if (!validated.ok) {
    return { ok: false, status: 0, error: 'Profil invalide', code: 'INVALID_PROFILE_PATCH', field: validated.field };
  }
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePatchMyProfile } = await import('./fixtures-profile');
    return { ok: true, data: fixturePatchMyProfile(validated.patch) };
  }
  return profileResult(await deps.transport.request<unknown>({ method: 'PATCH', path: '/api/v1/users/me', body: validated.patch }));
}

export async function patchMyImage(deps: ProfileDeps, kind: ProfileImageKind, url: string): Promise<ApiResult<MyProfile>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePatchMyImage } = await import('./fixtures-profile');
    return { ok: true, data: fixturePatchMyImage(kind, url) };
  }
  if (!ImageUrl.safeParse(url).success) {
    return { ok: false, status: 0, error: 'Adresse d’image refusée', code: 'INVALID_IMAGE_URL', field: kind };
  }
  return profileResult(
    await deps.transport.request<unknown>({ method: 'PATCH', path: `/api/v1/users/me/${kind}`, body: { [kind]: url } }),
  );
}

/**
 * **TRENTE MINUTES DE FRAÎCHEUR** (#6974) — mesuré : sans `staleTime`, le
 * défaut de l'application s'applique (30 s, `query-client.ts:234`), et
 * `routes/profile.tsx:134` relisait donc les 27 champs du profil à chaque
 * retour de focus passé la demi-minute.
 *
 * Ce qui autorise la fenêtre n'est PAS un pari sur l'immobilité de la donnée,
 * c'est l'inventaire de ce qui l'écrit : le porteur est le SEUL auteur de son
 * profil, et chacun de ses gestes écrit le cache dans le même mouvement
 * (`profile-actions.ts:129` l'avance optimiste, `:141`/`:214` la valeur
 * SERVIE). Un patch ne passe donc jamais par une relecture.
 *
 * **Ce que la fenêtre coûte, dit à voix haute** : aucun événement socket ne
 * porte `['me', 'profile']` (vérifié — `socket.ts` n'invalide que
 * `['conversations']`, `['notifications']` et `['friends']`). Un profil
 * modifié depuis un AUTRE appareil met donc jusqu'à 30 min à apparaître ici,
 * ou jusqu'au prochain démarrage à froid. C'est le bon arbitrage sur une
 * donnée que le lecteur vient de changer lui-même ailleurs, et un mauvais
 * arbitrage sur tout ce qu'un TIERS fait bouger — d'où la fenêtre plus courte
 * des statistiques ci-dessous.
 */
export const MY_PROFILE_STALE_TIME = 30 * 60_000;

/**
 * **CINQ MINUTES, PAS TRENTE** (#6974) — les statistiques sont la moitié de
 * cet écran que le porteur n'écrit PAS : abonnés, publications, messages
 * bougent sous les gestes des AUTRES. Aucun socket ne les porte et aucune
 * mutation locale ne les écrit (mesuré : `MY_STATS_QUERY_KEY` n'apparaît dans
 * aucun `setQueryData` du dépôt) — la seule chose qui les rafraîchit est cette
 * fenêtre. Elle reste donc au PLANCHER du lot : un compteur en retard de cinq
 * minutes est acceptable, en retard d'une demi-heure ne l'est pas.
 */
export const MY_STATS_STALE_TIME = 5 * 60_000;

export function myProfileQueryOptions(deps: ProfileDeps) {
  return {
    queryKey: MY_PROFILE_QUERY_KEY,
    staleTime: MY_PROFILE_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadMyProfile({ ...deps, ...withSignal(signal) })),
  };
}

export function myStatsQueryOptions(deps: ProfileDeps) {
  return {
    queryKey: MY_STATS_QUERY_KEY,
    staleTime: MY_STATS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadMyStats({ ...deps, ...withSignal(signal) })),
  };
}
