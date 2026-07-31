import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** Gardes de source + deux méta-tests qui prouvent que le filtre fonctionne. */
describe('PostService — câblage de la capture', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'PostService.ts'), 'utf-8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const code = strip(source);

  it('meta_strip_removesLineComments', () => {
    expect(strip('const a = 1; // mobileTranscription')).not.toContain('mobileTranscription');
  });

  it('meta_strip_keepsCode', () => {
    expect(strip('const a = 1; // x')).toContain('const a = 1;');
  });

  it('test_createPost_callsCaptureSounds', () => {
    expect(code).toContain('this.soundCaptureService.captureSounds');
  });

  it('test_captureCall_isOutsideMediaIdsGuard', () => {
    const guard = code.indexOf('if (data.mediaIds?.length)');
    const blockEnd = code.indexOf('\n    }', guard);
    expect(code.indexOf('this.soundCaptureService.captureSounds')).toBeGreaterThan(blockEnd);
    // `indexOf` ne voit que la PREMIÈRE occurrence : ré-encadrer l'appel dans un
    // SECOND `if (data.mediaIds?.length)` en aval passait inaperçu. Une story
    // peut réutiliser un média déjà attaché, donc ce gate ne doit exister qu'une
    // fois dans tout le fichier.
    expect(code.split('if (data.mediaIds?.length)')).toHaveLength(2);
  });

  it('test_captureCall_isNotGatedOnMobileTranscription', () => {
    const capture = code.indexOf('this.soundCaptureService.captureSounds');
    // Fenêtre courte : à 400 caractères elle attrapait la garde voisine légitime.
    expect(code.slice(Math.max(0, capture - 150), capture)).not.toContain('mobileTranscription');
  });

  it('test_updatePost_reusesCapture', () => {
    const start = code.indexOf('async updatePost');
    const end = code.indexOf('async deletePost');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(code.slice(start, end)).toContain('this.soundCaptureService.captureSounds');
  });

  it('test_repostPost_isNotWired_inLotA', () => {
    const start = code.indexOf('async repostPost');
    // Sans cette borne, renommer la méthode ferait passer le test À VIDE :
    // indexOf rend -1, slice(-1) rend le dernier caractère du fichier.
    expect(start).toBeGreaterThan(-1);
    expect(code.slice(start)).not.toContain('this.soundCaptureService.captureSounds');
  });

  /**
   * `repostPost` n'est pas la seule porte : `createPost` accepte lui aussi un
   * `repostOfId`. Sans cette condition, republier par cette voie créerait un
   * `Sound` crédité au REPOSTEUR — le piège d'attribution refermé d'un côté et
   * rouvert de l'autre.
   */
  it('test_createPost_repostPath_doesNotFeedTheLibrary', () => {
    const capture = code.indexOf('this.soundCaptureService.captureSounds');
    const call = code.slice(capture, capture + 400);
    // Expression ENTIÈRE, de `isPublic:` à la virgule finale. Chercher seulement
    // `PUBLIC && !data.repostOfId` laissait passer
    // `isPublic: (… && !data.repostOfId) || true` : le texte survivait à sa
    // propre neutralisation, la porte grande ouverte, le fichier vert.
    // Le vrai filet reste `SoundCaptureComposition.test.ts`, qui EXÉCUTE l'appel.
    expect(call).toContain('isPublic: data.visibility === PostVisibility.PUBLIC && !data.repostOfId,');
  });

  /**
   * L'édition est la TROISIÈME porte du piège d'attribution : `repostPost`
   * duplique les médias de la source SOUS le reposteur, donc un PUT sur le
   * repost passe le scope `postId` de la capture.
   */
  it('test_updatePost_repostPath_doesNotFeedTheLibrary', () => {
    const start = code.indexOf('async updatePost');
    const end = code.indexOf('async deletePost');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(code.slice(start, end))
      .toContain('isPublic: updated.visibility === PostVisibility.PUBLIC && !updated.repostOfId,');
  });

  /**
   * Sans ceci, une story supprimée par son auteur gardait ses usages jusqu'au
   * hard-delete (7 j) et un post non-STORY les gardait POUR TOUJOURS : le
   * `usageCount` qui trie la découverte n'aurait jamais redescendu.
   */
  it('test_deletePost_releasesItsUsages', () => {
    const start = code.indexOf('async deletePost');
    const end = code.indexOf('async likePost');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(code.slice(start, end)).toContain('this.soundCaptureService.releasePost(postId)');
  });

  /**
   * `UpdatePostSchema` a tous ses champs optionnels : un PUT partiel (audience,
   * légende) arrive sans `storyEffects`, et le blob en base n'est alors PAS
   * réécrit. Sans cette garde, la capture recevrait `tracks: []` et
   * `dropRemovedUsages` effacerait tous les usages d'une story qui joue
   * pourtant toujours son audio, en faussant `usageCount`.
   */
  it('test_updatePost_withoutStoryEffects_doesNotTouchUsages', () => {
    const start = code.indexOf('async updatePost');
    const end = code.indexOf('async deletePost');
    const body = code.slice(start, end);
    const guard = body.indexOf('if (data.storyEffects !== undefined)');
    const call = body.indexOf('this.soundCaptureService.captureSounds');
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
});
