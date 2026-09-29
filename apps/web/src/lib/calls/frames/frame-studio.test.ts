import { describe, expect, test } from 'bun:test';

import { captureFrames } from './frame-catalogue';
import { calls, inked, recorder } from './frame-recorder.test-support';
import { createFrameStudio, frameFaces, type FrameFaceTile, type FrameShot } from './frame-studio';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * L'ATELIER DES CADRES (#8742, #8743) — ce que le mode Montage charge à son
 * entrée : les ambiances et les cadres servis à `n` personnes, la
 * réconciliation quand `n` change, chaque visage dans SA case, et le rendu en
 * couches mises en cache (fond et dessus peints une fois, visages à chaque
 * image), jamais en miroir.
 */

const person = (id: string, isSelf = false): FramePerson => ({ id, name: id.toUpperCase(), handle: null, isSelf });
const texts: FrameTexts = { groupName: null, isGroup: false, date: '29 sept. 2026', accent: null };
const video = (label: string): CanvasImageSource => ({ label }) as unknown as CanvasImageSource;
const tile = (options: Partial<FrameFaceTile> & { readonly label: string }): FrameFaceTile => ({
  source: video(options.label),
  size: options.size ?? { width: 1280, height: 720 },
  fit: options.fit ?? 'cover',
  member: options.member ?? null,
  self: options.self ?? false,
});

describe('frameFaces — chaque visage dans la case de SA personne', () => {
  test('le membre par son identifiant, moi par ma vidéo ; sans vidéo, `null` (le cadre peint l’initiale)', () => {
    const people = [person('u-awa'), person('u-karim'), person('me', true)];
    const faces = frameFaces(people, [tile({ label: 'mine', self: true }), tile({ label: 'awa', member: 'u-awa' })]);
    expect(faces.map((face) => (face === null ? null : (face.source as unknown as { label: string }).label))).toEqual(['awa', null, 'mine']);
  });

  test('sa caméra plutôt que son écran partagé ; l’écran seul, faute de mieux', () => {
    const people = [person('u-awa'), person('u-karim')];
    const faces = frameFaces(people, [
      tile({ label: 'awa-screen', member: 'u-awa', fit: 'contain' }),
      tile({ label: 'awa-camera', member: 'u-awa' }),
      tile({ label: 'karim-screen', member: 'u-karim', fit: 'contain' }),
    ]);
    expect(faces.map((face) => (face?.source as unknown as { label: string }).label)).toEqual(['awa-camera', 'karim-screen']);
  });

  test('une vidéo qui ne dit pas à qui elle est ne se pose dans aucune case', () => {
    expect(frameFaces([person('u-awa')], [tile({ label: 'x' })])).toEqual([null]);
  });
});

describe('createFrameStudio — filtrer, réconcilier', () => {
  const studio = createFrameStudio({ fonts: undefined });

  test('à trois, aucune ambiance n’offre de cadre de duo', () => {
    const moods = studio.moods(3);
    expect(moods.length).toBeGreaterThan(0);
    const offered = moods.flatMap((mood) => studio.framesOf(3, mood));
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((frame) => frame.bucket === 'duo')).toEqual([]);
    expect(offered.every((frame) => frame.people[0] <= 3 && frame.people[1] >= 3)).toBe(true);
  });

  test('à deux, seulement des cadres de duo, de l’ambiance demandée', () => {
    const mood = studio.moods(2)[0];
    expect(mood).toBeDefined();
    const frames = mood === undefined ? [] : studio.framesOf(2, mood);
    expect(frames.every((frame) => frame.bucket === 'duo' && frame.mood === mood)).toBe(true);
  });

  test('seul dans l’appel : aucune ambiance', () => {
    expect(studio.moods(1)).toEqual([]);
  });

  test('un troisième arrive : le même motif, dans la variante de sa tranche ; sinon rien', () => {
    const duo = captureFrames().find((frame) => frame.bucket === 'duo' && captureFrames().some((other) => other.motif === frame.motif && other.bucket === 'comite'));
    expect(duo).toBeDefined();
    if (duo === undefined) return;
    expect(studio.reconcile(duo.id, 3)?.id).toBe(`${duo.motif}.comite`);
    expect(studio.reconcile(duo.id, 2)?.id).toBe(duo.id);
    expect(studio.reconcile('inconnu.rien.duo', 2)).toBeNull();
    expect(studio.find(duo.id)?.id).toBe(duo.id);
    expect(studio.find('inconnu')).toBeNull();
  });
});

describe('createFrameStudio — peindre', () => {
  const frame = captureFrames().find((candidate) => candidate.bucket === 'duo');
  const size = { width: 108, height: 192 };
  const shot = (faces: FrameShot['faces']): FrameShot => ({ people: [person('u-awa'), person('me', true)], faces, texts, size });

  test('sans toile hors écran, le cadre se peint entier, directement', () => {
    if (frame === undefined) throw new Error('aucun cadre de duo');
    const studio = createFrameStudio({ factory: () => null, fonts: undefined });
    const target = recorder();
    studio.draw(target.context, frame, shot([null, null]), 'thumb');
    expect(inked(target.log)).toBeGreaterThan(5);
  });

  test('les couches se peignent UNE fois ; chaque image ne repeint que les visages, à l’endroit', () => {
    if (frame === undefined) throw new Error('aucun cadre de duo');
    const made: ReturnType<typeof recorder>[] = [];
    const studio = createFrameStudio({
      factory: () => {
        const surface = recorder();
        made.push(surface);
        return { canvas: { layer: made.length } as unknown as CanvasImageSource, context: surface.context };
      },
      fonts: undefined,
    });
    const face = { source: video('awa'), size: { width: 1280, height: 720 } };
    const first = recorder();
    studio.draw(first.context, frame, shot([face, null]), 'preview');
    const second = recorder();
    studio.draw(second.context, frame, shot([face, null]), 'preview');
    expect(made).toHaveLength(2);
    const drawn = calls(second.log, 'drawImage').map((args) => args[0]);
    expect(drawn).toContain(face.source);
    expect(drawn.filter((source) => (source as { layer?: number }).layer !== undefined)).toHaveLength(2);
    expect(calls(second.log, 'scale').some(([x]) => typeof x === 'number' && x < 0)).toBe(false);
  });

  test('les polices chargées, les couches peintes avant elles se repeignent', async () => {
    if (frame === undefined) throw new Error('aucun cadre de duo');
    const made: unknown[] = [];
    const loads: string[] = [];
    const release: { run: () => void } = { run: () => undefined };
    const gate = new Promise<void>((resolve) => void (release.run = resolve));
    const studio = createFrameStudio({
      factory: () => {
        made.push(null);
        return { canvas: {} as CanvasImageSource, context: recorder().context };
      },
      fonts: {
        load: async (font: string) => {
          loads.push(font);
          await gate;
          return [];
        },
      },
    });
    studio.draw(recorder().context, frame, shot([null, null]), 'thumb');
    expect(made).toHaveLength(2);
    release.run();
    await studio.ready;
    expect(loads.length).toBeGreaterThan(0);
    studio.draw(recorder().context, frame, shot([null, null]), 'thumb');
    expect(made).toHaveLength(4);
  });
});
