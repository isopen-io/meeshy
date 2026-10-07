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
 *   - le champ `viewerPoints` posé ou transporté par un autre producteur : un
 *     service de fil qui le recalculerait, une diffusion à la room d'un post,
 *     une réponse d'écriture qui le servirait périmé ;
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

  it('le champ `viewerPoints` n’a qu’un producteur servi et qu’un producteur d’événement', () => {
    expect(filesNaming(/\bviewerPoints\b/)).toEqual([ONLY_WRITER, READ_LAW, LIST_STATE].sort());
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
