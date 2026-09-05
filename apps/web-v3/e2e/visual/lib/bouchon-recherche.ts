import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import { CONVERSATION_DU_LECTEUR, CONVERSATION_RICHE } from './bouchon-monde';

type Reponse = (corps: unknown, statut?: number) => void;

/**
 * LES TROIS ROUTES DE `/search` GARDÉES CÔTÉ CLIENT — extraites de
 * `bouchon-compte.ts` (#4170, bande 1000-1200 : un fichier qui grandit encore
 * se découpe AVANT d'ajouter, jamais après), PLUS LA TROISIÈME (#5174). La
 * quatrième (`GET /links?q=`) reste dans `bouchon-carnet.ts`, qui sert déjà
 * `GET /links` — un `q` de plus, pas une seconde route.
 *
 * Copiées sur la passerelle RÉELLE :
 *   • `GET /api/v1/conversations/search` — `routes/conversations/search.ts:67`,
 *     un tableau NU de `conversationMinimalSchema` : ni `pagination`, ni total ;
 *   • `GET /api/v1/directory/people` — `routes/directory/people.ts:87`, qui
 *     pagine par CURSEUR et déclare `isOnline` NULLABLE ;
 *   • `GET /api/v1/attachments/search` — `routes/attachments/search.ts:187`,
 *     `data.attachments` SOUS `data` (jamais un tableau nu), pagination par
 *     CURSEUR. La fixture référence `ar1`/`r1` du fil riche (`bouchon-monde.ts`,
 *     `messagesRiches`) : le clic e2e doit aboutir à la MÊME surimpression que
 *     `v3-medias.spec.ts` mesure déjà sur cette pièce.
 */
const RECHERCHE_FILS = [
  {
    id: CONVERSATION_DU_LECTEUR.id,
    identifier: 'lagos',
    title: CONVERSATION_DU_LECTEUR.titre,
    type: 'group',
    isActive: true,
    memberCount: CONVERSATION_DU_LECTEUR.membres,
    lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 3_600_000).toISOString(),
    participants: [],
  },
];

/** `isOnline` y est NULLABLE — c'est la forme que `/directory/people` déclare. */
const RECHERCHE_GENS = [
  {
    id: 'u-sara',
    username: 'sarakim',
    displayName: 'Sara Kim',
    avatar: null,
    isOnline: null,
    lastActiveAt: null,
  },
];

/**
 * Le média que le groupe « Médias » rend — la MÊME pièce que `messagesRiches`
 * sert déjà dans le fil riche (`r1`/`ar1`) : le clic e2e (« mène à la tranche
 * et à la pièce ») aboutit donc à une surimpression que `bouchon-fil.ts` sait
 * déjà servir, sans fixture jumelle.
 */
const RECHERCHE_MEDIAS = [
  {
    id: 'ar1',
    fileName: 'tableau.jpg',
    mimeType: 'image/jpeg',
    fileSize: 430_080,
    fileUrl: '/api/v1/attachments/file/2026/tableau.jpg',
    thumbnailUrl: null,
    duration: null,
    messageId: 'r1',
    originalName: 'tableau.jpg',
    uploadedBy: 'p-ibrahim',
    createdAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    width: 1200,
    height: 900,
    conversationId: CONVERSATION_RICHE.id,
  },
];

export const routesDeLaRecherche =
  (creanceDe: (requete: IncomingMessage) => Identite | null) =>
  ({ requete, url, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly json: Reponse }): boolean => {
    const chemin = url.pathname;
    // `/api/v1/directory/people` est une correspondance EXACTE — jamais un
    // préfixe : la passerelle RÉELLE déclare `GET /people` (la recherche, ce
    // module) et `GET /people/:handle` (le profil, `bouchon-annuaire.ts` via
    // `bouchon-compte.ts`) comme DEUX routes Fastify distinctes
    // (`routes/directory/people.ts:87`, `routes/directory/person.ts:175`), et
    // un `startsWith` ici interceptait aussi `/people/<handle>?expand=
    // relation` — le panneau de profil recevait alors la forme de LISTE (`data:
    // []` sans `q`), jamais un profil, et rendait « Profil indisponible » pour
    // tout le monde (correctif 2026-09-05).
    if (
      !(
        chemin.startsWith('/api/v1/conversations/search') ||
        chemin === '/api/v1/directory/people' ||
        chemin.startsWith('/api/v1/attachments/search')
      )
    ) {
      return false;
    }

    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ')) {
      json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      return true;
    }
    if (creanceDe(requete)?.genre !== 'membre') {
      json({ error: 'Invalid JWT token', code: 'AUTH_FAILED' }, 401);
      return true;
    }

    if (chemin.startsWith('/api/v1/conversations/search')) {
      json({ success: true, data: url.searchParams.get('q') ? RECHERCHE_FILS : [] });
      return true;
    }

    if (chemin.startsWith('/api/v1/directory/people')) {
      json({
        success: true,
        data: url.searchParams.get('q') ? RECHERCHE_GENS : [],
        pagination: { hasMore: false, nextCursor: null, limit: 20 },
      });
      return true;
    }

    // `/api/v1/attachments/search` — `data.attachments`, PAS un tableau nu
    // (`attachments/search.ts:206-224`).
    json({
      success: true,
      data: { attachments: url.searchParams.get('q') ? RECHERCHE_MEDIAS : [] },
      pagination: { limit: 50, hasMore: false, nextCursor: null },
    });
    return true;
  };
