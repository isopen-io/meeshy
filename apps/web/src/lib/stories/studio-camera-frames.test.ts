import { describe, expect, test } from 'bun:test';

import { canUseFrame } from '@meeshy/shared/types/frame-usage';

import { captureFrames } from '@/lib/calls/frames/frame-catalogue';
import { frameUsageOf } from '@/lib/calls/frames/frame-filter';
import type { CaptureFrame, FrameMood } from '@/lib/calls/frames/frame-spec';
import { createFrameStudio } from '@/lib/calls/frames/frame-studio';

import { STUDIO_CAMERA_FRAME_PEOPLE, studioCameraAuthor, studioCameraFramedName, studioCameraFrames, studioCameraTexts } from './studio-camera-frames';

/**
 * LA FAMILLE « CADRES » DE LA CAMÉRA DU COMPOSER (#10190, jumelle de
 * `ComposerLookStripRule.frameItems` iOS) — les cadres de capture que la loi
 * d'usage autorise pour une PHOTO et pour une VIDÉO (#10146), servis à deux
 * personnes comme le composer iOS (`catalogPeople = 2`, « une partie des
 * frames de deux ») : chaque cadre une fois, dans l'ordre des ambiances.
 */

describe('studioCameraFrames — ce que la caméra propose', () => {
  const studio = createFrameStudio({ fonts: undefined });
  const offered = studioCameraFrames(studio);

  test('chaque cadre proposé sert la photo ET la vidéo hors appel, selon la loi partagée', () => {
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((frame) => canUseFrame(frameUsageOf(frame), { kind: 'capture', media: 'photo' }))).toBe(true);
    expect(offered.every((frame) => canUseFrame(frameUsageOf(frame), { kind: 'capture', media: 'video' }))).toBe(true);
  });

  test('les cadres de duo, comme le composer iOS ; jamais ceux d’un groupe', () => {
    expect(STUDIO_CAMERA_FRAME_PEOPLE).toBe(2);
    expect(offered.every((frame) => frame.people[0] <= 2 && frame.people[1] >= 2)).toBe(true);
    const groupOnly = captureFrames().filter((frame) => frame.people[0] > 2);
    expect(groupOnly.length).toBeGreaterThan(0);
    expect(offered.filter((frame) => groupOnly.includes(frame))).toEqual([]);
  });

  test('chaque cadre une seule fois, dans l’ordre des ambiances', () => {
    expect(new Set(offered.map((frame) => frame.id)).size).toBe(offered.length);
    const moods = studio.moods(2);
    const order = offered.map((frame) => moods.indexOf(frame.mood));
    expect(order.every((rank, index) => rank >= 0 && (index === 0 || rank >= (order[index - 1] ?? 0)))).toBe(true);
  });

  test('un cadre servi par deux ambiances ne paraît qu’une fois', () => {
    const frame = offered[0] as CaptureFrame;
    const twice = studioCameraFrames({
      moods: () => ['jovial', 'elegant'] satisfies readonly FrameMood[],
      framesOf: () => [frame, frame],
    });
    expect(twice).toEqual([frame]);
  });
});

describe('studioCameraAuthor — l’auteur, tel que les cadres l’écrivent', () => {
  test('son nom d’affichage, sinon son pseudo — et c’est moi', () => {
    expect(studioCameraAuthor({ id: 'u-1', handle: 'awa', displayName: '  Awa Diallo ' })).toEqual({ id: 'u-1', name: 'Awa Diallo', handle: 'awa', isSelf: true });
    expect(studioCameraAuthor({ id: null, handle: 'awa', displayName: ' ' })).toEqual({ id: 'self', name: 'awa', handle: 'awa', isSelf: true });
    expect(studioCameraAuthor({ id: null, handle: null, displayName: '' })).toEqual({ id: 'self', name: '', handle: null, isSelf: true });
  });
});

describe('studioCameraTexts — ce que le cadre écrit autour de la prise', () => {
  test('la date seule : ni nom de groupe, ni accent de conversation (l’indigo Meeshy)', () => {
    expect(studioCameraTexts('25 oct. 2026')).toEqual({ groupName: null, isGroup: false, date: '25 oct. 2026', accent: null });
  });
});

describe('studioCameraFramedName — le fichier d’une prise encadrée', () => {
  test('dit son cadre, sans point, et son heure', () => {
    expect(studioCameraFramedName('jovial.confettis.duo', new Date(Date.UTC(2026, 9, 25, 8, 30, 5)))).toBe('photo-cadre-jovial-confettis-duo-2026-10-25T08-30-05-000Z.jpg');
  });
});
