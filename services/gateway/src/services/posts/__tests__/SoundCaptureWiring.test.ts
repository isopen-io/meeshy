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
    expect(call).toContain('!data.repostOfId');
  });
});
