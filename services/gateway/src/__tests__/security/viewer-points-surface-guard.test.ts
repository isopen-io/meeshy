/**
 * #9569 — `viewerPoints` est la donnée du LECTEUR, et de lui seul : ce qui part
 * À CÔTÉ ne se prouve pas sur un exemple, il se dénombre.
 *
 * Les témoins de comportement disent que la lecture est bornée au lecteur
 * (`viewerPostPoints.test.ts`), que l'annonce ne part qu'à sa room personnelle
 * (`PostPoints.test.ts`) et que les routes servent à chacun les siens
 * (`viewer-points-served.test.ts`, `hashtag-viewer-state.test.ts`). Aucun ne
 * peut dire qu'un AUTRE site ne lit pas la table ou ne pose pas le champ —
 * c'est la question de ce garde, et elle se répond en nommant les seuls
 * fichiers qui en ont le droit.
 *
 * Ce qu'il attrape :
 *   - une lecture ou une écriture de `EngagementPostPoints` hors de sa loi de
 *     lecture et de son seul écrivain — un site qui lirait les lignes d'une
 *     page sans les borner au lecteur, ou qui les agrégerait pour un tiers ;
 *   - un NOUVEL appelant de la loi de lecture ou de ses projections : le champ
 *     ne se pose pas en écrivant `viewerPoints`, il se pose en APPELANT
 *     `withViewerPoints` / `servedViewerPoints` — c'est donc la liste des
 *     appelants qui est figée, pas seulement le jeton. `PostService.getPostById`
 *     en est le contre-exemple à ne jamais écrire : il nourrit les réponses
 *     d'écriture ET la charge diffusée à l'audience d'une publication
 *     (`broadcastPayload`), qui porterait alors les points de l'auteur à ses
 *     abonnés ;
 *   - le lecteur passé à ces appels : chaque site de route le tire de
 *     l'identité authentifiée, jamais d'un champ du post ;
 *   - une relation ajoutée au modèle, qui ouvrirait la porte d'un `include`.
 *
 * Les commentaires sont retirés avant la recherche : la prose qui EXPLIQUE la
 * règle ne vaut pas usage.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from '../../routes/__tests__/response-schema-sweep';
import { walk } from '../helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '../..');
const SCHEMA_PATH = join(SRC_DIR, '../../../packages/shared/prisma/schema.prisma');

const READ_LAW = 'services/engagement/viewerPostPoints.ts';
const ONLY_WRITER = 'services/engagement/PostPointsRecorder.ts';
const LIST_STATE = 'services/posts/viewerPostState.ts';
/** La suppression d'un compte retire SES lignes — par `userId`, jamais une lecture. */
const ACCOUNT_PURGE = 'services/game/GamePurge.ts';

const productionSources = (): ReadonlyArray<{ readonly path: string; readonly code: string }> =>
  walk(SRC_DIR).map((path) => ({ path: relative(SRC_DIR, path), code: stripComments(readFileSync(path, 'utf8')) }));

const filesNaming = (pattern: RegExp): readonly string[] =>
  productionSources()
    .filter((file) => pattern.test(file.code))
    .map((file) => file.path)
    .sort();

const DETAIL_ROUTE = 'routes/posts/core.ts';
const STORIES_ROUTE = 'routes/posts/feed.ts';

/** Les appels d'une fonction dans un fichier, tels qu'écrits — nom, puis ses premiers arguments. */
const callsIn = (path: string, fn: string): readonly string[] => {
  const code = productionSources().find((file) => file.path === path)?.code ?? '';
  return [...code.matchAll(new RegExp(`\\b${fn}\\(([^)]*)\\)`, 'g'))].map((match) => match[1]!.replace(/\s+/g, ' ').trim());
};

describe('viewerPoints — qui lit la table, qui pose le champ (#9569)', () => {
  it('voit bien les sources du gateway — sinon un balayage vide passerait au vert', () => {
    expect(productionSources().length).toBeGreaterThan(400);
  });

  it('`EngagementPostPoints` n’est lue que par sa loi de lecture, écrite que par son écrivain, et retirée avec un compte par sa purge', () => {
    expect(filesNaming(/\bengagementPostPoints\b/)).toEqual([ACCOUNT_PURGE, ONLY_WRITER, READ_LAW].sort());
  });

  it('seule la loi de lecture LIT la table', () => {
    expect(filesNaming(/\bengagementPostPoints\s*\.\s*(findMany|findFirst|findUnique|count|aggregate|groupBy)\b/)).toEqual([READ_LAW]);
  });

  it('seul l’écrivain crée ou modifie une ligne', () => {
    expect(filesNaming(/\bengagementPostPoints\s*\.\s*(create|createMany|upsert|update|updateMany)\b/)).toEqual([ONLY_WRITER]);
  });

  it('une ligne ne se retire qu’avec son post ou avec son compte', () => {
    expect(filesNaming(/\bengagementPostPoints\s*\.\s*(delete|deleteMany)\b/)).toEqual([ACCOUNT_PURGE, ONLY_WRITER].sort());
  });

  it('le jeton `viewerPoints` n’est écrit que par la loi de lecture, l’écrivain et l’état de liste', () => {
    expect(filesNaming(/\bviewerPoints\b/)).toEqual([ONLY_WRITER, READ_LAW, LIST_STATE].sort());
  });

  it('la loi de lecture n’a que ses appelants déclarés — un nouveau site rougit ici', () => {
    expect(filesNaming(/\bloadViewerPostPoints\b/)).toEqual([ONLY_WRITER, READ_LAW].sort());
    expect(filesNaming(/\b(loadViewerPostPointsOrNone|servedViewerPoints)\b/)).toEqual([READ_LAW, LIST_STATE].sort());
    expect(filesNaming(/\bwithViewerPoints\b/)).toEqual([DETAIL_ROUTE, STORIES_ROUTE, READ_LAW].sort());
  });

  it('aucune écriture ni diffusion ne pose le champ : ni `PostService`, ni la publication, ni Socket.IO', () => {
    const posers = filesNaming(/\b(withViewerPoints|servedViewerPoints|loadViewerPostPoints|loadViewerPostPointsOrNone)\b/);

    expect(posers).not.toContain('services/PostService.ts');
    expect(posers).not.toContain('routes/posts/publication.ts');
    expect(posers.filter((path) => path.startsWith('socketio/'))).toEqual([]);
  });

  it('chaque route passe le lecteur AUTHENTIFIÉ, jamais un champ du post', () => {
    expect(callsIn(DETAIL_ROUTE, 'withViewerPoints')).toEqual(['prisma, viewerUserId, [post]']);
    expect(callsIn(STORIES_ROUTE, 'withViewerPoints')).toEqual([
      'prisma, userId, resultat.items',
      'prisma, userId, resultat.items',
    ]);
    expect(callsIn(LIST_STATE, 'loadViewerPostPointsOrNone')).toEqual(['prisma, viewerUserId, posts']);
    expect(callsIn(ONLY_WRITER, 'loadViewerPostPoints')).toEqual(['this.prisma, userId, [{ id: postId }]']);
  });

  it('le lecteur de la fiche est le compte inscrit de la requête — pas `authContext.userId`, qui nomme aussi un invité de lien', () => {
    const detail = productionSources().find((file) => file.path === DETAIL_ROUTE)?.code ?? '';
    const handler = detail.slice(detail.indexOf("fastify.get('/posts/:postId'"), detail.indexOf('withViewerPoints(prisma, viewerUserId'));

    expect(handler).toContain('const viewerUserId = authContext?.registeredUser?.id;');
  });

  it('aucune diffusion Socket.IO ne le transporte — l’annonce part de l’écrivain, vers le lecteur seul', () => {
    expect(filesNaming(/\bviewerPoints\b/).filter((path) => path.startsWith('socketio/'))).toEqual([]);
    expect(filesNaming(/ENGAGEMENT_POST_UPDATED/)).toEqual([ONLY_WRITER]);
  });

  it('le modèle n’a aucune relation : aucun `include` ne peut ramener les lignes des autres avec un post', () => {
    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    const start = schema.indexOf('model EngagementPostPoints {');
    const body = schema.slice(start, schema.indexOf('\n}', start));

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('@@unique([userId, postId])');
    expect(body).not.toMatch(/@relation/);
    expect(schema).not.toMatch(/EngagementPostPoints\s*(\[\]|\?)/);
  });

  it('rougirait sur un usage hors des fichiers autorisés — la recherche lit le code, pas la prose', () => {
    const leak = stripComments('// viewerPoints en prose\nconst served = { ...post, viewerPoints: all.get(post.id) };');
    const prose = stripComments('/** `viewerPoints` est expliqué ici */\nconst served = post;');

    expect(/\bviewerPoints\b/.test(leak)).toBe(true);
    expect(/\bviewerPoints\b/.test(prose)).toBe(false);
  });
});
