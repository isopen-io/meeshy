import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import { CONVERSATION_DU_LECTEUR } from './bouchon-monde';

/**
 * `GET /api/v1/communities`, `GET /api/v1/communities/:id/conversations`,
 * `POST /api/v1/communities` — les communautés du lecteur (§ 2 de la
 * spécification).
 *
 * NOUVEAU FICHIER, pas un ajout à `bouchon-compte.ts` (1144 lignes, en bande
 * budgétaire) : le patron déjà suivi par `bouchon-appels.ts` (#5108), extrait
 * pour la même raison.
 *
 * COPIE LA LOI DE `communities/core.ts:99-239` (liste), `:497-681`
 * (conversations) et `:388-495` (création) — pas une réponse inventée :
 * `onRequest: [fastify.authenticate]` + `registeredUser` sur les TROIS routes
 * (un porteur JWT, jamais `X-Session-Token` — l'invité n'y a jamais accès),
 * les clés EXACTES de `communitySchema` après `flattenCommunityCounts`
 * (`memberCount`/`conversationCount`, jamais `_count` brut), et
 * `communityConversationSchema` (`_count.participants`, `participants[].
 * user.isOnline: false` — la forme POST-GATE de `member-presence.ts:88`,
 * jamais la valeur réelle : masquée-comme-hors-ligne, pas retirée).
 *
 * **LA GARDE DE PRÉSENCE SE MESURE ICI, SUR LA FORME DE LA CHARGE** : la
 * liste ne porte NI `members` NI `creator.isOnline` (§ 2.1 — `communitySchema`
 * ne les déclare pas), exactement ce que `communautes-porte.test.ts` T-garde
 * épingle en lisant cette fixture.
 */

type Reponse = (corps: unknown, statut?: number) => void;

export type CommunauteDeBouchon = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly isPrivate: boolean;
  readonly memberCount: number;
  readonly conversationCount: number;
};

/**
 * DEUX COMMUNAUTÉS NOMMÉES — la matière EXACTE de la cible (`cible/
 * communities.png`) : « Diaspora FR-EN » publique 128/14, « Atelier
 * traduction » privée 32. Une TROISIÈME, privée, où le lecteur n'est NI
 * créateur NI membre — jamais servie par `GET /communities` (dont le
 * `whereClause` filtre déjà sur `createdBy`/`members.userId`), mais
 * atteignable en 403 par `?ouverte=` sur une adresse composée à la main.
 */
export const COMMUNAUTE_DIASPORA: CommunauteDeBouchon = {
  id: 'comm-diaspora',
  identifier: 'mshy_diaspora-fr-en',
  name: 'Diaspora FR-EN',
  isPrivate: false,
  memberCount: 128,
  conversationCount: 14,
};

export const COMMUNAUTE_ATELIER: CommunauteDeBouchon = {
  id: 'comm-atelier',
  identifier: 'mshy_atelier-traduction',
  name: 'Atelier traduction',
  isPrivate: true,
  memberCount: 32,
  conversationCount: 3,
};

/** Ni créateur ni membre — 403 sur `?ouverte=comm-fermee` (§ 2.2 : « Access denied to this community »). */
export const COMMUNAUTE_FERMEE_AU_LECTEUR: CommunauteDeBouchon = {
  id: 'comm-fermee',
  identifier: 'mshy_cercle-ferme',
  name: 'Cercle fermé',
  isPrivate: true,
  memberCount: 6,
  conversationCount: 1,
};

const NOMMEES: CommunauteDeBouchon[] = [COMMUNAUTE_DIASPORA, COMMUNAUTE_ATELIER];

const communauteServie = (c: CommunauteDeBouchon) => ({
  id: c.id,
  identifier: c.identifier,
  name: c.name,
  description: null,
  avatar: null,
  banner: null,
  isPrivate: c.isPrivate,
  isActive: true,
  deletedAt: null,
  createdBy: 'u1',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-08-20T09:00:00.000Z',
  creator: { id: 'u1', username: 'membre', displayName: 'Vous', avatar: null },
  memberCount: c.memberCount,
  conversationCount: c.conversationCount,
});

type ConversationDeBouchon = {
  readonly id: string;
  readonly title: string | null;
  readonly participants: number;
  readonly lastMessageAt: string | null;
};

/**
 * L'UNE DES CONVERSATIONS DE « DIASPORA FR-EN » EST `CONVERSATION_DU_LECTEUR`
 * — un fil que le bouchon sert déjà (`bouchon-fil.ts`) : cliquer une ligne de
 * la surimpression doit atteindre un `/chats/:id` qui répond, pas un id
 * inventé.
 */
const CONVERSATIONS_DIASPORA: ConversationDeBouchon[] = [
  { id: CONVERSATION_DU_LECTEUR.id, title: CONVERSATION_DU_LECTEUR.titre, participants: 12, lastMessageAt: '2026-09-04T18:00:00.000Z' },
  { id: 'conv-diaspora-2', title: 'Annonces', participants: 2, lastMessageAt: '2026-09-01T08:00:00.000Z' },
];

const CONVERSATIONS_ATELIER: ConversationDeBouchon[] = [
  { id: 'conv-atelier-1', title: null, participants: 5, lastMessageAt: '2026-08-30T10:00:00.000Z' },
];

const conversationsDe = (id: string): ConversationDeBouchon[] | null => {
  if (id === COMMUNAUTE_DIASPORA.id) return CONVERSATIONS_DIASPORA;
  if (id === COMMUNAUTE_ATELIER.id) return CONVERSATIONS_ATELIER;
  return null;
};

const conversationServie = (id: string, c: ConversationDeBouchon) => ({
  id: c.id,
  identifier: null,
  title: c.title,
  type: 'group',
  description: null,
  avatar: null,
  banner: null,
  isActive: true,
  memberCount: c.participants,
  lastMessageAt: c.lastMessageAt,
  communityId: id,
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: c.lastMessageAt ?? '2026-06-01T09:00:00.000Z',
  // FORME POST-GATE (`member-presence.ts:88`) : `isOnline:false`, jamais la
  // valeur réelle — masquée-comme-hors-ligne, la co-participation à une
  // conversation ne vaut plus d'accès à la présence d'un tiers.
  participants: Array.from({ length: Math.min(c.participants, 3) }, (_, i) => ({
    id: `part-${c.id}-${i}`,
    userId: `u-${c.id}-${i}`,
    displayName: `Membre ${i + 1}`,
    role: 'member',
    isActive: true,
    user: { id: `u-${c.id}-${i}`, username: `membre${i}`, displayName: `Membre ${i + 1}`, avatar: null, isOnline: false },
  })),
  _count: { messages: 4, participants: c.participants },
});

/** `generateIdentifier` du gateway (`core.ts:432`) — pas la fonction réelle, une approximation SUFFISANTE : un slug déterministe du nom, préfixé `mshy_`. */
const identifiantAutoGenere = (nom: string): string =>
  `mshy_${nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;

/**
 * L'ÉTAT DES COMMUNAUTÉS CRÉÉES PENDANT UN SPEC — porté par l'APPELANT
 * (`serveurs.ts`), jamais module-level : le patron `liensCrees`
 * (`bouchon-carnet.ts`), pas `communautesCreees` en haut de fichier — un
 * tableau au niveau du module survivrait à TOUS les `passerelleDeBouchon()`
 * du process de test, et une communauté créée dans un spec fuirait dans le
 * suivant.
 */
export const routesDesCommunautes =
  (
    creanceDe: (requete: IncomingMessage) => Identite | null,
    communautesCreees: CommunauteDeBouchon[],
    options: { readonly vide: () => boolean } = { vide: () => false },
  ) =>
  ({
    requete,
    url,
    corps,
    json,
  }: {
    readonly requete: IncomingMessage;
    readonly url: URL;
    readonly corps: Buffer;
    readonly json: Reponse;
  }): boolean => {
    if (!url.pathname.startsWith('/api/v1/communities')) return false;

    // `onRequest: [fastify.authenticate]` SEUL — jamais `X-Session-Token`.
    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ') || creanceDe(requete)?.genre !== 'membre') {
      json({ success: false, error: 'NOT_AUTHENTICATED', message: 'User must be authenticated' }, 401);
      return true;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    // ['api','v1','communities', …]
    const idDeLURL = segments[3];
    const dernierSegment = segments[segments.length - 1];

    // GET /api/v1/communities/:id/conversations
    if (requete.method === 'GET' && idDeLURL !== undefined && dernierSegment === 'conversations') {
      if (idDeLURL === COMMUNAUTE_FERMEE_AU_LECTEUR.id) {
        json({ success: false, error: 'FORBIDDEN', message: 'Access denied to this community' }, 403);
        return true;
      }
      const conversations = conversationsDe(idDeLURL);
      if (conversations === null) {
        json({ success: false, error: 'NOT_FOUND', message: 'Community not found' }, 404);
        return true;
      }
      json({
        success: true,
        data: conversations.map((c) => conversationServie(idDeLURL, c)),
        pagination: { total: conversations.length, limit: 20, offset: 0, hasMore: false },
      });
      return true;
    }

    // GET /api/v1/communities  (liste)
    if (requete.method === 'GET' && idDeLURL === undefined) {
      if (options.vide()) {
        json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
        return true;
      }
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
      const limite = Number(url.searchParams.get('limit') ?? '20') || 20;
      const creees = communautesCreees.map(communauteServie);
      const toutes = [...NOMMEES.map(communauteServie), ...creees];
      const page = toutes.slice(offset, offset + limite);
      json({
        success: true,
        data: page,
        pagination: { total: toutes.length, limit: limite, offset, hasMore: offset + page.length < toutes.length },
      });
      return true;
    }

    // POST /api/v1/communities  (création)
    if (requete.method === 'POST' && idDeLURL === undefined) {
      const champs = JSON.parse(corps.toString('utf8') || '{}') as { name?: unknown; description?: unknown; isPrivate?: unknown };
      const nom = typeof champs.name === 'string' ? champs.name : '';
      const identifiant = identifiantAutoGenere(nom);
      const existe = [...NOMMEES, ...communautesCreees].some((c) => c.identifier === identifiant);
      if (existe) {
        json({ success: false, error: `A community with identifier "${identifiant}" already exists`, message: `A community with identifier "${identifiant}" already exists` }, 409);
        return true;
      }
      const neuve: CommunauteDeBouchon = {
        id: `comm-creee-${communautesCreees.length + 1}`,
        identifier: identifiant,
        name: nom,
        isPrivate: champs.isPrivate === true,
        memberCount: 1,
        conversationCount: 0,
      };
      communautesCreees.push(neuve);
      json({ success: true, data: communauteServie(neuve) }, 201);
      return true;
    }

    json({ success: false, error: 'NOT_FOUND', message: 'Route not found' }, 404);
    return true;
  };
