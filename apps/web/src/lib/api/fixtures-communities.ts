import type { ApiResult } from './http';
import type { CommunitySettingsBody } from './community-settings';
import type { CommunityConversationPage, CommunityPage, CommunitySummary, CreateCommunityBody, MembershipGesture } from './communities';
import { COMMUNITIES_PAGE_SIZE, searchTermOf } from './communities';
import { VIEWER_ID } from './fixtures-base';

/**
 * **LES COMMUNAUTÉS DU LECTEUR DE RECETTE** (#6364) — servies par le MÊME
 * chemin que la passerelle (`communities.ts`, garde `__FIXTURES__ && source ===
 * 'fixtures'`), élaguées de tout build `VITE_DATA_SOURCE=gateway`
 * (`vite.config.ts § FIXTURE_MODULE`).
 *
 * Trois communautés, et pas une : une privée, une publique, une dont la
 * description manque — c'est ce qui fait voir les deux puces de confidentialité
 * et la carte sans sous-titre. La recherche filtre comme la passerelle (nom ou
 * identifiant, insensible à la casse, deux caractères au moins). Une création
 * est tenue en mémoire le temps de l'onglet, et un identifiant déjà pris
 * répond 409 : c'est ce qui permet au gate navigateur de mesurer le refus sous
 * son champ. Les conversations mènent à des fils du jeu de fixtures
 * (`c-deploiement`, `c-annonces`) : ouvrir un canal ouvre un vrai fil.
 */

const INITIAL: readonly CommunitySummary[] = [
  {
    id: 'm-polyglottes',
    identifier: 'mshy_polyglottes',
    name: 'Les polyglottes de Dakar',
    description: 'Échanges linguistiques du jeudi soir, en wolof, français et anglais.',
    avatar: null,
    banner: null,
    isPrivate: false,
    createdBy: 'u-amina',
    memberCount: 1284,
    conversationCount: 6,
  },
  {
    id: 'm-deploiement',
    identifier: 'mshy_equipe-deploiement',
    name: 'Équipe déploiement',
    description: 'Les canaux de l’équipe qui livre Meeshy.',
    avatar: null,
    banner: null,
    isPrivate: true,
    createdBy: VIEWER_ID,
    memberCount: 9,
    conversationCount: 2,
  },
  {
    id: 'm-lecture',
    identifier: 'mshy_club-lecture',
    name: 'Club de lecture',
    description: null,
    avatar: null,
    banner: null,
    isPrivate: true,
    createdBy: 'u-kwame',
    memberCount: 23,
    conversationCount: 1,
  },
];

/**
 * Une communauté PUBLIQUE dont le lecteur n'est pas membre (#6378) : absente de
 * « mes communautés », elle s'ouvre par son lien direct
 * (`/communities/mshy_randonneurs`) et se rejoint — c'est elle qui fait voir
 * « Rejoindre » au gate navigateur.
 */
const OUTSIDE: readonly CommunitySummary[] = [
  {
    id: 'm-randonneurs',
    identifier: 'mshy_randonneurs',
    name: 'Randonneurs du Cap-Vert',
    description: 'Sorties du dimanche et récits de sentier.',
    avatar: null,
    banner: null,
    isPrivate: false,
    createdBy: 'u-amina',
    memberCount: 57,
    conversationCount: 0,
  },
];

const CONVERSATIONS: Readonly<Record<string, CommunityConversationPage>> = {
  'm-deploiement': {
    conversations: [
      { id: 'c-deploiement', identifier: null, title: 'Équipe déploiement', type: 'group', avatar: null, memberCount: 5, lastMessageAt: null },
      { id: 'c-annonces', identifier: 'annonces', title: 'Annonces produit', type: 'broadcast', avatar: null, memberCount: 9, lastMessageAt: null },
    ],
    nextOffset: null,
  },
};

const state: { communities: readonly CommunitySummary[]; outside: readonly CommunitySummary[] } = { communities: INITIAL, outside: OUTSIDE };

const sameCommunity = (communityId: string) => (community: CommunitySummary) =>
  community.id === communityId || community.identifier === communityId;

const matches = (community: CommunitySummary, term: string): boolean => {
  const needle = term.toLowerCase();
  return community.name.toLowerCase().includes(needle) || community.identifier.toLowerCase().includes(needle);
};

export function fixtureCommunities(search: string, offset: number): CommunityPage {
  const term = searchTermOf(search);
  const found = term === '' ? state.communities : state.communities.filter((community) => matches(community, term));
  const page = found.slice(offset, offset + COMMUNITIES_PAGE_SIZE);
  const next = offset + page.length;
  return { communities: page, nextOffset: next < found.length ? next : null };
}

export function fixtureCommunity(communityId: string): CommunitySummary | null {
  const mine = state.communities.find(sameCommunity(communityId));
  if (mine !== undefined) return { ...mine, viewerRole: mine.createdBy === VIEWER_ID ? 'admin' : 'member' };
  const outside = state.outside.find(sameCommunity(communityId));
  return outside === undefined || outside.isPrivate ? null : { ...outside, viewerRole: null };
}

/** Rejoindre / quitter, avec les refus de la passerelle (403 privée ou créateur, 409 déjà membre, 404 déjà parti). */
export function fixtureChangeMembership(communityId: string, gesture: MembershipGesture): ApiResult<null> {
  const mine = state.communities.find(sameCommunity(communityId));
  const outside = state.outside.find(sameCommunity(communityId));
  if (gesture === 'join') {
    if (mine !== undefined) return { ok: false, status: 409, error: 'You are already a member of this community' };
    if (outside === undefined) return { ok: false, status: 404, error: 'Community not found' };
    if (outside.isPrivate) return { ok: false, status: 403, error: 'Cannot join a private community without an invite' };
    state.outside = state.outside.filter((community) => community.id !== outside.id);
    state.communities = [{ ...outside, memberCount: outside.memberCount + 1 }, ...state.communities];
    return { ok: true, data: null };
  }
  if (mine === undefined) return { ok: false, status: 404, error: 'You are not a member of this community' };
  if (mine.createdBy === VIEWER_ID) return { ok: false, status: 403, error: 'Community creator cannot leave their own community.' };
  state.communities = state.communities.filter((community) => community.id !== mine.id);
  state.outside = [{ ...mine, memberCount: Math.max(0, mine.memberCount - 1) }, ...state.outside];
  return { ok: true, data: null };
}

export function fixtureCommunityConversations(communityId: string): CommunityConversationPage {
  const community = fixtureCommunity(communityId);
  return (community === null ? undefined : CONVERSATIONS[community.id]) ?? { conversations: [], nextOffset: null };
}

const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function fixtureCreateCommunity(body: CreateCommunityBody): ApiResult<CommunitySummary> {
  const raw = body.identifier ?? slugOf(body.name);
  const identifier = raw.startsWith('mshy_') ? raw : `mshy_${raw}`;
  if ([...state.communities, ...state.outside].some((community) => community.identifier === identifier)) {
    return { ok: false, status: 409, error: `A community with identifier "${identifier}" already exists`, field: 'identifier' };
  }
  const created: CommunitySummary = {
    id: `m-${state.communities.length + 1}-${slugOf(body.name) || 'communaute'}`,
    identifier,
    name: body.name,
    description: body.description ?? null,
    avatar: null,
    banner: null,
    isPrivate: body.isPrivate,
    createdBy: VIEWER_ID,
    memberCount: 1,
    conversationCount: 0,
  };
  state.communities = [created, ...state.communities];
  return { ok: true, data: created, status: 201 };
}

/** Régler / supprimer (#6377), avec les refus de la passerelle : 403 à qui ne l'a pas créée, 404 à une inconnue. */
export function fixtureUpdateCommunity(communityId: string, body: CommunitySettingsBody): ApiResult<CommunitySummary> {
  const mine = state.communities.find(sameCommunity(communityId));
  if (mine === undefined) return { ok: false, status: 404, error: 'Community not found' };
  if (mine.createdBy !== VIEWER_ID) return { ok: false, status: 403, error: 'Only community creator can update community', code: 'COMMUNITY_CREATOR_ONLY' };
  const updated: CommunitySummary = {
    ...mine,
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.description === undefined ? {} : { description: body.description === '' ? null : body.description }),
    ...(body.isPrivate === undefined ? {} : { isPrivate: body.isPrivate }),
  };
  state.communities = state.communities.map((community) => (community.id === mine.id ? updated : community));
  return { ok: true, data: updated };
}

export function fixtureDeleteCommunity(communityId: string): ApiResult<null> {
  const mine = state.communities.find(sameCommunity(communityId));
  if (mine === undefined) return { ok: false, status: 404, error: 'Community not found' };
  if (mine.createdBy !== VIEWER_ID) return { ok: false, status: 403, error: 'Only community creator can delete community', code: 'COMMUNITY_CREATOR_ONLY' };
  state.communities = state.communities.filter((community) => community.id !== mine.id);
  return { ok: true, data: null };
}
