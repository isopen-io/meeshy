/**
 * #20204 — LA RÉPONSE D'UN LIKE NE SERT PAS LE POST, ET C'EST CE QUI LA GARDE.
 *
 * L'issue annonçait une fuite : « les réponses de `POST /posts/:postId/like` et
 * `DELETE …/like` rendent le post entier au lecteur ; un client qui remplace sa
 * copie par la réponse y voit revenir le commentaire retiré du fil ».
 *
 * **Mesuré FAUX.** Les deux gestes servent `{ liked, reactionSummary }`, et
 * rien d'autre — le post rendu par `likePost` / `unlikePost` ne quitte le
 * gestionnaire que par six champs (`likeCount`, `reactionSummary`, `authorId`,
 * `type`, `createdAt`, `expiresAt`), consommés par la diffusion de compteurs et
 * par la notification. `withMentions(res, …)` y compose donc une valeur dont
 * la charge utile n'emporte aucun compagnon.
 *
 * C'est la règle du cycle 84 : **un audit qui liste des sites ne liste pas des
 * fuites ; avant de qualifier l'une, traverser la sérialisation.** Ce qui a
 * rendu la fuite crédible, c'est la FORME du site — un `withMentions` est la
 * composition d'une réponse SERVIE partout ailleurs dans le dépôt.
 *
 * ─── CE QUE CE TÉMOIN GARDE, ET CE QU'IL NE PROUVE PAS ───────────────────
 *
 * Il garde une PORTE, pas un bug. La non-fuite est ACCIDENTELLE : elle tient à
 * ce que le gestionnaire compose sa réponse à la main. Le jour où quelqu'un
 * sert le post depuis ces routes — pour épargner un aller-retour au client,
 * raison parfaitement légitime — la fuite s'ouvre le même jour, et aucun autre
 * témoin du dépôt ne tombe. Celui-ci tombe, et il OBLIGE son auteur à poser la
 * séparation (`servedWireReader`) dans le même lot.
 *
 * Il ne prouve RIEN sur la séparation elle-même : il prouve que ces deux
 * réponses n'ont pas de compagnon à taire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../services/PostService', () => require('./interactions.harness').postServiceModule());
jest.mock('../../../../services/MediaService', () => require('./interactions.harness').mediaServiceModule());
jest.mock('../../../../services/MentionService', () => require('./interactions.harness').mentionServiceModule());
jest.mock('../../../../services/TrackingLinkService', () => require('./interactions.harness').trackingLinkServiceModule());
jest.mock('../../../../middleware/rate-limiter', () => require('./interactions.harness').rateLimiterModule());
jest.mock('../../../../utils/withMutationLog', () =>
  require('./interactions.harness').withMutationLogModule(
    jest.requireActual('../../../../utils/withMutationLog') as object
  )
);
jest.mock('../../../../services/CacheStore', () => require('./interactions.harness').cacheStoreModule());

// L'import de la route vient AVANT celui du harnais, et ce n'est pas un détail
// de style : le harnais importe lui-même la route, donc charger le harnais
// d'abord ouvre un cycle où la fabrique du double de `PostService` requiert un
// harnais encore partiel (`postServiceModule is not a function`). Même ordre
// que `interactions.reactions.test.ts`.
import '../../../../routes/posts/interactions';

import { buildApp, POST_ID, mockLikePost, mockUnlikePost, mockGetPostById } from './interactions.harness';

const AUTHOR = 'author-1';
const SEPARATED = '507f1f77bcf86cd799439003';

const person = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null });

/** Un post dont les compagnons sont RECONNAISSABLES dans le corps servi. */
const postWithCompanions = () => ({
  id: POST_ID,
  type: 'POST',
  authorId: AUTHOR,
  likeCount: 1,
  reactionSummary: { '❤️': 1 },
  comments: [{ id: 'c-separated', content: 'TEXTE-DU-COMPAGNON', author: person(SEPARATED) }],
  repostOf: { id: 'src-1', content: 'SOURCE-DU-COMPAGNON', author: person(SEPARATED), postMentions: [] },
});

beforeEach(() => {
  mockLikePost.mockReset();
  mockLikePost.mockResolvedValue(postWithCompanions());
  mockUnlikePost.mockReset();
  mockUnlikePost.mockResolvedValue({ id: POST_ID, removedEmoji: '❤️', post: postWithCompanions() });
  mockGetPostById.mockReset();
  mockGetPostById.mockResolvedValue(postWithCompanions());
});

describe('#20204 — ce que la réponse d’un like emporte', () => {
  it('POST /like sert `{ liked, reactionSummary }` et AUCUN compagnon du post', async () => {
    const app = await buildApp({});

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ liked: true, reactionSummary: { '❤️': 1 } });
    expect(res.body).not.toContain('TEXTE-DU-COMPAGNON');
    expect(res.body).not.toContain('SOURCE-DU-COMPAGNON');
    await app.close();
  });

  it('DELETE /like sert `{ liked: false, reactionSummary }` et AUCUN compagnon du post', async () => {
    const app = await buildApp({});

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ liked: false, reactionSummary: { '❤️': 1 } });
    expect(res.body).not.toContain('TEXTE-DU-COMPAGNON');
    expect(res.body).not.toContain('SOURCE-DU-COMPAGNON');
    await app.close();
  });
});
