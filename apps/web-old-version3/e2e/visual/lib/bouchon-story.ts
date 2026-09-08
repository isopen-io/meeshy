import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';

/**
 * LES ROUTES DE LA STORY INDISPONIBLE, côté passerelle de bouchon — le SEUL
 * appel que `/stories/:id` (et `/moods/:id`, `/reels/:id` — MÊME porte,
 * `app/(public)/partage-porte.ts`) fait pour SERVIR ou REFUSER une
 * publication : `GET /api/v1/posts/:postId`
 * (`services/gateway/src/routes/posts/core.ts:459-485`, `requiredAuth`).
 *
 * ÉMETTEUR COPIÉ, PAS INVENTÉ (§ 0 de la spécification `storyFail`,
 * issue #4967) : `PostService.getPostById`
 * (`services/gateway/src/services/PostService.ts:694-745`) ne filtre QUE
 * `deletedAt` et la VISIBILITÉ — jamais `expiresAt` — et rend TOUJOURS 404
 * `POST_NOT_FOUND` pour une publication absente, supprimée OU hors audience
 * (`:686-689`, « indistinguishable from "doesn't exist" by design ») :
 * JAMAIS 403. Sans `Bearer` valide, la route rend 401
 * (`middleware/auth.ts:897,933`) — la porte de la v3 court-circuite déjà ce
 * cas (`partage-porte.ts` : sans jeton, AUCUN appel), donc ce refus ne sert
 * qu'à un test qui poserait un jeton MORT.
 *
 * QUATRE IDENTIFIANTS FIXES portent les QUATRE causes que `storyFail` doit
 * rendre INDISTINGUABLES (absente, supprimée, échue, restreinte) — la MÊME
 * réponse 404 sur les TROIS genres, puisque `partageLu` refuse déjà tout
 * `type` qui ne correspond pas au genre demandé (§ 5.1 de la spécification) :
 * demander `supprimée` sur `/reels/…` tombe sur le verrou de genre plutôt que
 * sur `deletedAt`, et rend 404 quand même — l'oracle ne dépend pas du CHEMIN
 * interne emprunté. `story-vivante` sert une story qui SE LIT — la garde qui
 * prouve que ce bouchon ne 404 pas tout.
 */

const HEURE = 3_600_000;

const brute = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'story-vivante',
  type: 'STORY',
  content: 'Une story de test, servie par le bouchon.',
  originalLanguage: 'fr',
  createdAt: new Date(Date.now() - HEURE).toISOString(),
  expiresAt: new Date(Date.now() + 19 * HEURE).toISOString(),
  authorId: 'u-bouchon',
  author: { id: 'u-bouchon', displayName: 'Amina', username: 'amina' },
  translations: {},
  isLikedByMe: false,
  media: [],
  ...attributs,
});

const ABSENTE = (): { readonly statut: number; readonly corps: unknown } => ({
  statut: 404,
  corps: { success: false, error: 'Post not found', message: 'Post not found', code: 'POST_NOT_FOUND' },
});

/** Les QUATRE causes — toutes 404, jamais 403 (§ 0 de la spécification). */
const CAUSES: Readonly<Record<string, () => { readonly statut: number; readonly corps: unknown }>> = {
  absente: ABSENTE,
  // « restreinte » : hors audience — la passerelle réelle la fond dans le
  // MÊME 404 que l'absente (`buildVisibilityFilter`).
  restreinte: ABSENTE,
  supprimee: () => ({
    statut: 200,
    corps: { success: true, data: brute({ id: 'supprimee', deletedAt: new Date(Date.now() - HEURE).toISOString() }) },
  }),
  echue: () => ({
    statut: 200,
    corps: { success: true, data: brute({ id: 'echue', expiresAt: new Date(Date.now() - HEURE).toISOString() }) },
  }),
};

type Reponse = (corps: unknown, statut?: number) => void;

export const routesDeLaStory =
  ({ creanceDe }: { readonly creanceDe: (requete: IncomingMessage) => Identite | null }) =>
  ({ requete, url, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly json: Reponse }): boolean => {
    const correspond = /^\/api\/v1\/posts\/([^/]+)$/.exec(url.pathname);
    if (correspond === null || (requete.method ?? 'GET') !== 'GET') return false;
    const id = correspond[1] ?? '';
    if (id !== 'story-vivante' && CAUSES[id] === undefined) return false;

    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ') || creanceDe(requete)?.genre !== 'membre') {
      json({ success: false, error: 'Authentication required', message: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
      return true;
    }

    if (id === 'story-vivante') {
      json({ success: true, data: brute() });
      return true;
    }

    const cause = CAUSES[id];
    const { statut, corps } = cause !== undefined ? cause() : ABSENTE();
    json(corps, statut);
    return true;
  };
