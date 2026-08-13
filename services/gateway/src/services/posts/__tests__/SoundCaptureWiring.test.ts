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
    // La règle est une fonction PARTAGÉE, testée exhaustivement
    // (`soundEligibility.test.ts`). Cette garde ne vérifie plus que le
    // câblage : que ce site l'appelle bien avec SES deux entrées.
    expect(call).toContain('feedsSoundLibrary({ visibility: data.visibility, repostOfId: data.repostOfId })');
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
      .toContain('feedsSoundLibrary({ visibility: updated.visibility, repostOfId: updated.repostOfId })');
  });

  /**
   * Sans ceci, une story supprimée par son auteur gardait ses usages jusqu'au
   * hard-delete (7 j) et un post non-STORY les gardait POUR TOUJOURS : le
   * `usageCount` qui trie la découverte n'aurait jamais redescendu.
   *
   * La libération vit maintenant dans `applyPostRemovalEffects`, partagée avec
   * `DELETE /admin/posts/:postId`. `deletePost` doit donc lui passer SON
   * instance — celle que les tests court-circuitent — et non la laisser en
   * construire une seconde sur le défaut du paramètre.
   */
  it('test_deletePost_releasesItsUsages', () => {
    const start = code.indexOf('async deletePost');
    const end = code.indexOf('async likePost');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = code.slice(start, end);
    expect(body).toContain('applyPostRemovalEffects(');
    expect(body).toContain('this.soundCaptureService');
  });

  /**
   * L'autre bout de la même chaîne : la délégation ci-dessus ne libère rien si
   * le module partagé ne le fait pas. Les deux gardes ensemble couvrent ce
   * qu'un seul appel couvrait avant la mise en commun.
   */
  it('test_postRemovalEffects_releasesItsUsages', () => {
    const shared = strip(
      fs.readFileSync(path.join(__dirname, '..', 'postRemovalEffects.ts'), 'utf-8')
    );
    expect(shared).toContain('soundCapture.releasePost(post.id)');
  });

  /**
   * `UpdatePostSchema` a tous ses champs optionnels : un PUT partiel (audience,
   * légende) arrive sans `storyEffects`, et le blob en base n'est alors PAS
   * réécrit. Deux protections se composent depuis l'extension médias :
   * 1. la capture ne se relance que si l'édition EXPRIME quelque chose sur les
   *    sons (blob envoyé, composition média touchée, opt-in d'extraction) ;
   * 2. quand elle se relance SANS blob envoyé, les pistes sont relues du blob
   *    EN BASE (`updated.storyEffects`) — jamais `tracks: []` par défaut, qui
   *    ferait effacer les usages d'une story qui joue toujours son audio.
   */
  it('test_updatePost_withoutStoryEffects_doesNotTouchUsages', () => {
    const start = code.indexOf('async updatePost');
    const end = code.indexOf('async deletePost');
    const body = code.slice(start, end);
    const guard = body.indexOf(
      'if (data.storyEffects !== undefined || editTouchesComposition || data.allowSoundExtraction !== undefined)');
    const call = body.indexOf('this.soundCaptureService.captureSounds');
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
    expect(body).toContain('?? (updated.storyEffects as Record<string, unknown> | null) ?? undefined');
  });

  /**
   * Chemin des posts VOCAUX (AudioPostComposer) : l'audio arrive par
   * `mediaIds`, sans blob `storyEffects`. Les deux sites de capture doivent
   * passer par `collectCaptureTracks` (blob + synthèse médias) — revenir à
   * `extractCaptureTracks` seul ferait sortir ces posts de la bibliothèque.
   */
  it('test_bothCaptureSites_collectMediaTracksToo', () => {
    expect(code.split('this.collectCaptureTracks(').length).toBe(3);
  });

  /**
   * L'extraction vidéo est un OPT-IN par post : le drapeau transmis à la
   * collecte doit venir du champ persisté/demandé, jamais d'une constante.
   */
  it('test_videoExtraction_isGatedOnTheAuthorOptIn', () => {
    expect(code).toContain('data.allowSoundExtraction ?? false');
    expect(code).toContain('updated.allowSoundExtraction === true');
  });
});
