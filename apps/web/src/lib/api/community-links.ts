import * as z from 'zod/mini';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES LIENS DE SES COMMUNAUTÉS** (#6410) — miroir
 * `CommunityLinkService` (`packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift`).
 * Un lien de communauté n'est pas une ligne en base : c'est l'adresse PUBLIQUE
 * d'une communauté que le lecteur ADMINISTRE ou MODÈRE.
 *
 * - `GET communities.mine?role=admin,moderator` (`membership.ts`) — bornée par
 *   la passerelle aux appartenances ACTIVES du lecteur, communautés
 *   désactivées exclues (#8876) : une communauté dont il n'est que membre, ou
 *   qu'il a quittée, n'est jamais servie.
 *
 * **L'adresse est `/communities/<identifier>`**, celle que les deux clients
 * ouvrent (`community` du web, `DeepLinkRouter.community` d'iOS). iOS compose
 * `/chat/<identifier>`, l'adresse d'un lien de CONVERSATION : un identifiant de
 * communauté n'y résout rien.
 *
 * Le nombre de membres et la date de création ne sont servis que depuis le lot
 * qui les ajoute à la réponse : une ligne lue avant se peint sans eux, jamais
 * avec un zéro inventé.
 */

export type CommunityLinksDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const COMMUNITY_LINKS_QUERY_KEY = ['community-links', 'mine'] as const;
export const COMMUNITY_LINKS_STALE_TIME = 5 * 60_000;

export type CommunityRole = 'admin' | 'moderator';

export type CommunityLink = {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly avatar: string | null;
  readonly isPrivate: boolean;
  readonly role: CommunityRole;
  readonly memberCount: number | null;
  readonly createdAt: string | null;
};

export type CommunityLinksSummary = { readonly communities: number; readonly publicCommunities: number; readonly members: number | null };

const optionalText = z.optional(z.nullable(z.string()));

const WireCommunity = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1)),
  identifier: z.string().check(z.minLength(1)),
  avatar: optionalText,
  isPrivate: z.optional(z.nullable(z.boolean())),
  role: z.string(),
  memberCount: z.optional(z.nullable(z.number())),
  createdAt: optionalText,
});

const ROLES: readonly CommunityRole[] = ['admin', 'moderator'];

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value.trim();

export function decodeCommunityLink(raw: unknown): CommunityLink | null {
  const parsed = WireCommunity.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const role = ROLES.find((candidate) => candidate === wire.role.toLowerCase());
  if (role === undefined) return null;
  const createdAt = textOrNull(wire.createdAt);
  return {
    id: wire.id,
    name: wire.name.trim(),
    identifier: wire.identifier.trim(),
    avatar: textOrNull(wire.avatar),
    isPrivate: wire.isPrivate !== false,
    role,
    memberCount: typeof wire.memberCount === 'number' && Number.isFinite(wire.memberCount) && wire.memberCount >= 0 ? Math.floor(wire.memberCount) : null,
    createdAt: createdAt !== null && !Number.isNaN(Date.parse(createdAt)) ? createdAt : null,
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadCommunityLinks(params: CommunityLinksDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly CommunityLink[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunityLinks } = await import('./fixtures-link-families');
    return { ok: true, data: fixtureCommunityLinks() };
  }
  const query = new URLSearchParams({ role: 'admin,moderator' });
  const result = await params.transport.request<unknown>({ method: 'GET', path: `${communitiesEndpoints.mine}?${query.toString()}`, ...withSignal(params.signal) });
  if (!result.ok) return result;
  const rows: readonly unknown[] = Array.isArray(result.data) ? result.data : [];
  const links = rows.flatMap((raw) => {
    const link = decodeCommunityLink(raw);
    return link === null ? [] : [link];
  });
  return { ok: true, data: [...links].sort((left, right) => left.name.localeCompare(right.name)) };
}

export function communityLinksQueryOptions(deps: CommunityLinksDeps) {
  return {
    queryKey: COMMUNITY_LINKS_QUERY_KEY,
    staleTime: COMMUNITY_LINKS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadCommunityLinks({ ...deps, ...withSignal(signal) })),
  };
}

/** Le total des membres ne se dit que si CHAQUE ligne le porte : une somme partielle mentirait. */
export function summarizeCommunityLinks(links: readonly CommunityLink[]): CommunityLinksSummary {
  const counts = links.map((link) => link.memberCount);
  const members = counts.every((count): count is number => count !== null) ? counts.reduce((sum, count) => sum + count, 0) : null;
  return { communities: links.length, publicCommunities: links.filter((link) => !link.isPrivate).length, members };
}

export const communityLinkUrl = (origin: string, identifier: string): string => `${origin}/communities/${encodeURIComponent(identifier)}`;

export const findCommunityLink = (links: readonly CommunityLink[] | undefined, key: string): CommunityLink | undefined =>
  links?.find((link) => link.id === key || link.identifier === key);
