import { describe, expect, test } from 'bun:test';

import { captureFrameUsage, describeFrameUsage, FRAME_USAGE_LABEL_KEYS, type FrameUseContext } from '@meeshy/shared/types/frame-usage';

import { captureFrames } from './frame-catalogue';
import { CAPTURE_FRAME_USES, CALL_FRAME_USES, frameUsageOf, offeredFor } from './frame-filter';
import type { CaptureFrame } from './frame-spec';
import { createFrameStudio } from './frame-studio';

/**
 * LA LOI D'USAGE CHEZ LES CADRES D'APPEL (#10146) — premier consommateur de
 * `packages/shared/types/frame-usage.ts`. Directive porteur 2026-10-11 : « un
 * frame appels vidéo ne peut être utilisé que pour les appels vidéo et la
 * capture caméra hors appel vidéo, mais un frame uniquement pour la capture
 * photo/vidéo ne peut pas être utilisé pour les appels vidéo ». La projection
 * `surfaces` → usage est celle de la loi partagée, jamais une jumelle.
 */

const base = (): CaptureFrame => {
  const first = captureFrames().find((frame) => frame.bucket === 'duo');
  if (first === undefined) throw new Error('aucun cadre de duo au catalogue');
  return first;
};

const variant = (id: string, surfaces: CaptureFrame['surfaces']): CaptureFrame => {
  const { surfaces: _ignored, ...rest } = base();
  return { ...rest, id: `jovial.${id}.duo`, motif: `jovial.${id}`, mood: 'jovial', ...(surfaces === undefined ? {} : { surfaces }) };
};

const live = variant('direct', ['capture', 'live']);
const captureOnly = variant('photo', ['capture']);
const undeclared = variant('muet', undefined);

describe('frameUsageOf — la projection de la loi partagée, sans jumelle', () => {
  test('chaque cadre du catalogue reçoit exactement l’usage que `captureFrameUsage` lui donne', () => {
    for (const frame of captureFrames()) expect({ id: frame.id, usage: frameUsageOf(frame) }).toEqual({ id: frame.id, usage: captureFrameUsage(frame.surfaces) });
  });

  test('`live` ⇒ appel et capture ; `capture` seul ou rien de déclaré ⇒ photo et vidéo, jamais l’appel', () => {
    expect(frameUsageOf(live)).toEqual({ kind: 'free', surfaces: ['call', 'photo', 'video'] });
    expect(frameUsageOf(captureOnly)).toEqual({ kind: 'free', surfaces: ['photo', 'video'] });
    expect(frameUsageOf(undeclared)).toEqual({ kind: 'free', surfaces: ['photo', 'video'] });
  });
});

describe('offeredFor — ce qu’une surface propose', () => {
  const all = [live, captureOnly, undeclared];
  const ids = (frames: readonly CaptureFrame[]) => frames.map((frame) => frame.id);

  test('en appel vidéo, JAMAIS un cadre de capture seule', () => {
    expect(ids(offeredFor(all, CALL_FRAME_USES))).toEqual([live.id]);
  });

  test('en capture photo et vidéo, les deux : le cadre du direct ET le cadre de capture seule', () => {
    expect(ids(offeredFor(all, CAPTURE_FRAME_USES))).toEqual(ids(all));
  });

  test('une capture vidéo seule les reçoit tous ; le jeu (succès, prestige) n’en reçoit AUCUN', () => {
    const contexts: readonly FrameUseContext[] = [{ kind: 'capture', media: 'video' }];
    expect(ids(offeredFor(all, contexts))).toEqual(ids(all));
    expect(ids(offeredFor(all, [{ kind: 'achievement' }]))).toEqual([]);
    expect(ids(offeredFor(all, [{ kind: 'prestige' }]))).toEqual([]);
  });
});

describe('createFrameStudio — l’offre suit l’usage, la résolution par identifiant reste au catalogue connu', () => {
  test('un atelier d’appel ne propose ni ambiance ni cadre de capture seule, ni par réconciliation', () => {
    const studio = createFrameStudio({ frames: [captureOnly, live, undeclared], fonts: undefined, uses: CALL_FRAME_USES });
    expect(studio.moods(2)).toEqual(['jovial']);
    expect(studio.framesOf(2, 'jovial').map((frame) => frame.id)).toEqual([live.id]);
    expect(studio.reconcile(captureOnly.id, 2)?.id).toBe(live.id);
    expect(studio.find(captureOnly.id)?.id).toBe(captureOnly.id);
  });

  test('l’atelier de capture (le défaut, celui du mode Montage) propose les deux', () => {
    const studio = createFrameStudio({ frames: [captureOnly, live], fonts: undefined });
    expect(studio.framesOf(2, 'jovial').map((frame) => frame.id)).toEqual([captureOnly.id, live.id]);
  });

  test('chaque cadre dit où il sert : le libellé de `describeFrameUsage`', () => {
    const studio = createFrameStudio({ frames: [captureOnly, live], fonts: undefined });
    expect(studio.usageLabel(live)).toEqual(describeFrameUsage(captureFrameUsage(live.surfaces)));
    expect(studio.usageLabel(live).key).toBe(FRAME_USAGE_LABEL_KEYS.callAndCapture);
    expect(studio.usageLabel(captureOnly).key).toBe(FRAME_USAGE_LABEL_KEYS.captureOnly);
  });
});
