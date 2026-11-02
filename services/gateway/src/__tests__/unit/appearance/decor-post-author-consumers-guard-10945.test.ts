/**
 * #10945 — CLIQUET : la colonne `equippedAvatarRing` que lisent les formes de
 * post (`postAuthorSelect` et les selects qui l'emploient) ne quitte le serveur
 * que résolue en `profileDecor` — par `withMentions` (posts, stories, statuts,
 * republications, aperçus de commentaires) ou `hoistCommentCarriers`
 * (commentaires). Les routes de post ne déclarent AUCUN schéma de réponse :
 * rien d'autre que ces deux frontières n'arrête la colonne.
 *
 * Chaque fichier ci-dessous a été relu : ses lignes chargées par ces formes
 * passent par l'une des deux frontières. Un fichier EN TROP est un nouveau
 * consommateur — vérifier qu'il sert ses lignes par `withMentions` /
 * `hoistCommentCarriers`, puis l'ajouter ici. Un fichier EN MOINS : le retirer.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');
const SHAPES = /\b(postInclude|storyPostInclude|statusPostSelect|trayStorySelect|postAuthorSelect|repostOfInclude|commentsPreviewInclude)\b/;

const REVIEWED = [
  'routes/posts/hashtag.ts',
  'routes/posts/nearby.ts',
  'services/PostCommentService.ts',
  'services/PostFeedService.ts',
  'services/PostService.ts',
  // #11264 — `notifyPostReaders` relit le post par `postInclude` et le sert par `withMentions(post, WIRE_BROADCAST)`.
  'services/attachments/media-processing/ready-listener.ts',
  'services/posts/PostAudioService.ts',
  'services/posts/postIncludes.ts',
];

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });

const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('#10945 — les consommateurs des formes de post sont relus', () => {
  it('aucun nouveau fichier ne charge un auteur de post sans passer par une frontière relue', () => {
    const consumers = sources(SRC)
      .filter((path) => SHAPES.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .sort();
    expect(consumers).toEqual([...REVIEWED].sort());
  });
});
