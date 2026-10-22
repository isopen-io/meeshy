import { describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryOffer, GloryOfferTile } from '@/lib/game-photo/glory-choice';
import type { GloryScene, GloryStep, GloryTexts } from '@/lib/game-photo/glory/glory-scene';
import { rankMoment } from '@/lib/game-photo/moments';
import type { RetakeSession } from '@/lib/game-photo/notebook';
import { GamePhotoFlow } from '@/components/game-photo-flow';
import { by, choose, env, settle, setupGamePhotoFlowTests, type FlowLog } from '@/test-support/game-photo-flow-harness';

const { mount, click } = setupGamePhotoFlowTests();

/**
 * LA REPRISE D'UNE PHOTO GARDÉE (#10166, L13, § 5.13) — depuis le carnet, le
 * déroulé se rouvre au moment de l'entrée AVEC sa recette : la même photo si sa
 * source est gardée (sinon selfie neuf ou carte seule), le cadre et la pose
 * présélectionnés, le message écrit, la date de la plaque. « Plus tard » n'a
 * pas de sens pour une photo déjà gardée. « Garder » remplace l'entrée.
 */
const ambassador = rankMoment({ rank: 'ambassadeur', division: 2 });
const thumb: PackAssetRef = { src: '0123456789abcdef.webp', bytes: 1, sha256: '0'.repeat(64) };
const ref = (frameId: string): FrameRef => ({ pack: 'afrique', frameId });
const tile = (frameId: string): GloryOfferTile => ({ ref: ref(frameId), name: frameId, usage: 'Rang Ambassadeur II uniquement', thumb, poses: ['perches', 'pied'], defaultPose: 'perches', squareSimple: false, message: true, ready: true, missingBytes: 0 });
const fakeScene = (frameId: string): GloryScene => ({ frame: { id: frameId } as unknown as GloryScene['frame'], pack: 'afrique', crest: null, bannerLayout: () => null, paint: () => undefined, close: () => undefined });

const source = new Blob(['photo'], { type: 'image/jpeg' });
const session = (overrides: Partial<RetakeSession> = {}): RetakeSession => ({
  choices: ['same-photo', 'selfie', 'card'],
  source,
  mode: 'selfie',
  recipe: { frameId: 'royaumes.ambassadeur-2', pose: 'pied', message: 'Enfin', mirror: true, showLink: false, momentAt: '2026-10-01T09:00:00.000Z' },
  at: new Date('2026-10-01T09:00:00.000Z'),
  ...overrides,
});

/** L'offre de l'étape, présélectionnée comme la loi le ferait depuis `lastChosen` ; les appels à la scène et l'étape relue sont journalisés. */
function offered(preselected: string) {
  const offer: GloryOffer = { tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2')], preselected: ref(preselected) };
  const steps: GloryStep[] = [];
  const calls: { readonly frame: string | undefined; readonly pose: string | null | undefined; readonly texts: GloryTexts }[] = [];
  const { env: base, log } = env();
  const value: PhotoEnv = {
    ...base,
    gloryOffer: async (step) => (steps.push(step), offer),
    glory: async ({ frame, pose, texts }) => (calls.push({ frame: frame?.frameId, pose, texts }), fakeScene(frame?.frameId ?? preselected)),
    gloryThumb: async () => null,
  };
  return { env: value, log, steps, calls };
}

const openRetake = (retake: RetakeSession, e: PhotoEnv, log: FlowLog) => mount(<GamePhotoFlow moment={ambassador} env={e} retake={retake} onClose={(result) => log.closed.push(result)} />);

describe('la proposition de reprise', () => {
  test('la même photo, un selfie neuf ou la carte seule — jamais « plus tard »', async () => {
    const { env: e, log } = env();
    const host = await openRetake(session(), e, log);
    expect(host.textContent).toContain('On la reprend ?');
    expect(choose(host, 'same-photo')).not.toBeNull();
    expect(choose(host, 'selfie')).not.toBeNull();
    expect(choose(host, 'card')).not.toBeNull();
    expect(choose(host, 'later')).toBeNull();
  });

  test('une entrée sans source (ancienne, ou carte seule) ne propose pas la même photo', async () => {
    const { env: e, log } = env();
    const host = await openRetake(session({ choices: ['selfie', 'card'], source: null, mode: 'card', recipe: {} }), e, log);
    expect(choose(host, 'same-photo')).toBeNull();
    expect(choose(host, 'selfie')).not.toBeNull();
  });
});

describe('reprendre la même photo', () => {
  test('la source se relit, dans le miroir de la recette, et l’image se compose sans caméra ; « Garder » remet le mode gardé et la date de l’étape', async () => {
    const { env: e, log } = env();
    const host = await openRetake(session(), e, log);
    await click(choose(host, 'same-photo'));
    await settle();
    expect(log.cameraOpened).toBe(0);
    expect(log.rendered).toEqual([{ moment: ambassador, mirror: true }]);
    expect(by(host, 'data-photo-keep')).not.toBeNull();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept).toHaveLength(1);
    expect(log.kept[0]?.moment.id).toBe(ambassador.id);
    expect(log.kept[0]?.photo.mode).toBe('selfie');
    expect(log.kept[0]?.photo.recipe).toMatchObject({ mirror: true, momentAt: '2026-10-01T09:00:00.000Z' });
  });

  test('la plaque et le cadre portent la date de l’étape, pas celle du jour', async () => {
    const { env: e, log, calls } = offered('royaumes.ambassadeur-2');
    const host = await openRetake(session(), e, log);
    await click(choose(host, 'same-photo'));
    await settle();
    expect(calls[0]?.texts.date).toBe('1 octobre 2026');
    expect(log.dates).toEqual([new Date('2026-10-01T09:00:00.000Z')]);
  });
});

describe('le cadre, la pose et le message repartent de la recette', () => {
  test('la loi relit l’étape avec le cadre gardé en dernier choix ; la scène s’ouvre dans la pose gardée ; le message est écrit', async () => {
    const { env: e, log, steps, calls } = offered('royaumes.ambassadeur-2');
    const host = await openRetake(session(), e, log);
    await click(choose(host, 'same-photo'));
    await settle();
    expect(steps[0]?.lastChosen).toBe('royaumes.ambassadeur-2');
    expect(calls[0]).toMatchObject({ frame: 'royaumes.ambassadeur-2', pose: 'pied' });
    expect(host.querySelector<HTMLInputElement>('input[data-photo-message]')?.value).toBe('Enfin');
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe).toMatchObject({ frameId: 'royaumes.ambassadeur-2', pose: 'pied', message: 'Enfin' });
  });

  test('un cadre que la loi ne propose plus (pack retiré, autre atmosphère) laisse la présélection de la loi, dans la pose gardée si elle existe', async () => {
    const { env: e, log, calls } = offered('savane.ambassadeur-2');
    const host = await openRetake(session({ recipe: { frameId: 'disparu.ambassadeur-2', pose: 'pied' } }), e, log);
    await click(choose(host, 'same-photo'));
    await settle();
    expect(calls[0]).toMatchObject({ frame: 'savane.ambassadeur-2', pose: 'pied' });
  });

  test('changer de cadre sur le résultat recompose, puis « Garder » remplace avec le nouveau cadre', async () => {
    const { env: e, log, calls } = offered('royaumes.ambassadeur-2');
    const host = await openRetake(session(), e, log);
    await click(choose(host, 'same-photo'));
    await settle();
    await click(host.querySelector<HTMLElement>('[data-photo-frame-option="savane.ambassadeur-2"]'));
    await settle();
    expect(calls.at(-1)?.frame).toBe('savane.ambassadeur-2');
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe).toMatchObject({ frameId: 'savane.ambassadeur-2' });
  });
});
