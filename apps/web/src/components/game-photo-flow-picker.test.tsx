import { describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { GloryFrameBirdLayout } from '@meeshy/shared/types/glory-frame-format';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryOffer, GloryOfferTile } from '@/lib/game-photo/glory-choice';
import type { GloryScene } from '@/lib/game-photo/glory/glory-scene';
import { rankMoment } from '@/lib/game-photo/moments';
import { by, choose, env, settle, setupGamePhotoFlowTests, takeFrame } from '@/test-support/game-photo-flow-harness';

const { click, open } = setupGamePhotoFlowTests();

/**
 * LE CADRE ET LA POSE SE CHOISISSENT AVANT DE DÉCLENCHER, ET SE CHANGENT APRÈS
 * (#10164, L11) : sous l'aperçu, la bande des cadres que la loi partagée
 * propose pour l'étape (jamais un cadre qu'elle refuse), chaque tuile avec son
 * libellé d'usage et sa présence ; la carte simple reste un choix ; une tuile
 * absente se met en tête de file et l'aperçu bascule à `ready` sans spinner ;
 * la pose se choisit parmi celles du cadre ; sur le résultat, changer cadre ou
 * pose recompose l'image sans reprendre la photo et fait revenir « Enregistrer ».
 */
const ambassador = rankMoment({ rank: 'ambassadeur', division: 2 });
const thumb: PackAssetRef = { src: '0123456789abcdef.webp', bytes: 1, sha256: '0'.repeat(64) };
const ref = (frameId: string): FrameRef => ({ pack: 'afrique', frameId });

const tile = (frameId: string, overrides: Partial<GloryOfferTile> = {}): GloryOfferTile => ({
  ref: ref(frameId),
  name: frameId === 'savane.ambassadeur-2' ? 'Acacia' : 'Trône',
  usage: 'Rang Ambassadeur II uniquement',
  thumb,
  poses: ['perches', 'pied'],
  defaultPose: 'perches',
  squareSimple: frameId === 'savane.ambassadeur-2',
  message: frameId === 'savane.ambassadeur-2',
  ready: true,
  missingBytes: 0,
  ...overrides,
});

type Call = { readonly frame: FrameRef | null | undefined; readonly pose: GloryFrameBirdLayout | null | undefined; readonly scale: number };

const fakeScene = (frameId: string): GloryScene => ({
  frame: { id: frameId } as unknown as GloryScene['frame'],
  pack: 'afrique',
  crest: null,
  bannerLayout: () => null,
  paint: () => undefined,
  close: () => undefined,
});

/** `warm: 'later'` : le chargement d'une tuile absente attend `releaseWarm()` — le cadre arrive APRÈS la prise. */
function offered(offer: GloryOffer, options: { readonly ready?: ReadonlySet<string>; readonly warmOk?: boolean; readonly warm?: 'later' } = {}) {
  const calls: Call[] = [];
  const warmed: string[] = [];
  const ready = new Set(options.ready ?? offer.tiles.filter((t) => t.ready).map((t) => t.ref.frameId));
  const pending: (() => void)[] = [];
  const releaseWarm = () => pending.splice(0).forEach((release) => release());
  const { env: base, log } = env();
  const value: PhotoEnv = {
    ...base,
    gloryOffer: async () => offer,
    glory: async ({ frame, pose, scale }) => {
      calls.push({ frame, pose, scale });
      const id = frame === undefined ? offer.preselected?.frameId : frame?.frameId;
      return id !== undefined && ready.has(id) ? fakeScene(id) : null;
    },
    gloryWarm: async (frame) => {
      warmed.push(frame.frameId);
      if (options.warmOk === false) return false;
      if (options.warm === 'later') await new Promise<void>((resolve) => pending.push(resolve));
      ready.add(frame.frameId);
      return true;
    },
    gloryThumb: async () => null,
  };
  return { env: value, log, calls, warmed, releaseWarm };
}

const twoTiles: GloryOffer = { tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2', { poses: ['duo'], defaultPose: 'duo' })], preselected: ref('savane.ambassadeur-2') };

const option = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-photo-frame-option="${id}"]`);
const poseOption = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-photo-pose-option="${id}"]`);

describe('la bande des cadres sous l’aperçu (#10164)', () => {
  test('les tuiles de l’offre, la présélection cochée, le libellé d’usage sur chacune, la carte simple en option ; la scène s’ouvre sur la présélection', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(option(host, 'savane.ambassadeur-2')?.getAttribute('aria-checked')).toBe('true');
    expect(option(host, 'royaumes.ambassadeur-2')?.getAttribute('aria-checked')).toBe('false');
    expect(option(host, 'simple')?.textContent).toContain('Carte simple');
    expect(host.querySelectorAll('[data-photo-frame-usage]')).toHaveLength(2);
    expect(host.querySelector('[data-photo-frame-usage]')?.textContent).toBe('Rang Ambassadeur II uniquement');
    expect(option(host, 'savane.ambassadeur-2')?.textContent).toContain('Carré : carte simple');
    expect(option(host, 'royaumes.ambassadeur-2')?.textContent).not.toContain('Carré : carte simple');
    expect(calls.at(-1)).toEqual({ frame: ref('savane.ambassadeur-2'), pose: null, scale: 0.5 });
  });

  test('choisir une autre tuile rouvre la scène sur elle ; la prise part avec CE cadre, et la recette du carnet le garde', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(calls.at(-1)).toEqual({ frame: ref('royaumes.ambassadeur-2'), pose: null, scale: 0.5 });
    await click(takeFrame(host));
    await settle();
    expect(calls.filter((call) => call.scale === 1).at(-1)?.frame).toEqual(ref('royaumes.ambassadeur-2'));
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe).toMatchObject({ frameId: 'royaumes.ambassadeur-2' });
  });

  test('la carte simple choisie exprès : aucune scène, la prise part sans cadre décoré, la recette ne nomme aucun cadre', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const before = calls.length;
    await click(option(host, 'simple'));
    await settle();
    expect(calls.length).toBe(before);
    expect(host.querySelector('[data-photo-glory-canvas]')).toBeNull();
    await click(takeFrame(host));
    await settle();
    expect(calls.filter((call) => call.scale === 1)).toHaveLength(0);
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe?.frameId).toBeUndefined();
  });

  test('sans offre (ancien environnement) : aucune bande, la scène se demande comme avant', async () => {
    const { env: e, log } = env();
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[data-photo-frame-picker]')).toBeNull();
  });
});

describe('la présence par tuile', () => {
  const missing: GloryOffer = { tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2', { ready: false, missingBytes: 420_000 })], preselected: ref('savane.ambassadeur-2') };

  test('une tuile absente dit son poids ; la toucher la charge en priorité, la carte simple en attendant, et l’aperçu bascule dès `ready`', async () => {
    const { env: e, log, calls, warmed } = offered(missing);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[data-photo-frame-presence="royaumes.ambassadeur-2"]')?.textContent?.replace(/\s/g, ' ')).toBe('420 ko à télécharger');
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(warmed).toEqual(['royaumes.ambassadeur-2']);
    const opened = calls.filter((call) => call.frame?.frameId === 'royaumes.ambassadeur-2');
    expect(opened.length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('[data-photo-frame-presence="royaumes.ambassadeur-2"]')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
  });

  test('un chargement qui échoue le dit et propose « Réessayer », qui recharge', async () => {
    const { env: e, log, warmed } = offered(missing, { warmOk: false });
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(host.querySelector('[data-photo-frame-presence="royaumes.ambassadeur-2"]')?.textContent).toContain('n’a pas pu se charger');
    const retry = host.querySelector<HTMLElement>('[data-photo-frame-retry="royaumes.ambassadeur-2"]');
    expect(retry?.textContent).toBe('Réessayer');
    await click(retry);
    await settle();
    expect(warmed).toEqual(['royaumes.ambassadeur-2', 'royaumes.ambassadeur-2']);
  });
});

describe('la pose', () => {
  test('les poses du cadre choisi, la sienne par défaut ; en choisir une rouvre la scène avec elle et la recette la garde', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(poseOption(host, 'perches')?.getAttribute('aria-checked')).toBe('true');
    expect(poseOption(host, 'pied')?.textContent).toBe('Au pied');
    await click(poseOption(host, 'pied'));
    await settle();
    expect(calls.at(-1)).toEqual({ frame: ref('savane.ambassadeur-2'), pose: 'pied', scale: 0.5 });
    await click(takeFrame(host));
    await settle();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe).toMatchObject({ pose: 'pied' });
  });

  test('un cadre à une seule pose ne propose aucun choix de pose', async () => {
    const { env: e, log } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(host.querySelector('[data-photo-pose-picker]')).toBeNull();
  });
});

describe('tout se change après', () => {
  test('sur le résultat, changer de cadre recompose l’image sans reprendre la photo, et « Enregistrer » revient (loi capture-save)', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(log.rendered).toHaveLength(1);
    expect(by(host, 'data-photo-save')).toBeNull();
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(log.rendered).toHaveLength(2);
    expect(calls.filter((call) => call.scale === 1).at(-1)?.frame).toEqual(ref('royaumes.ambassadeur-2'));
    expect(by(host, 'data-photo-save')).not.toBeNull();
    expect(log.cameraOpened).toBe(1);
  });

  test('sur le résultat, changer de pose recompose aussi, et « Enregistrer » revient : la pose nomme la version', async () => {
    const { env: e, log, calls } = offered(twoTiles);
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(by(host, 'data-photo-save')).toBeNull();
    await click(poseOption(host, 'pied'));
    await settle();
    expect(log.rendered).toHaveLength(2);
    expect(calls.filter((call) => call.scale === 1).at(-1)?.pose).toBe('pied');
    expect(by(host, 'data-photo-save')).not.toBeNull();
    await click(poseOption(host, 'perches'));
    await settle();
    expect(log.rendered).toHaveLength(3);
    expect(by(host, 'data-photo-save')).toBeNull();
  });

  test('un cadre choisi mais pas encore prêt se prend en carte simple, et c’est elle qui se nomme ; quand il arrive, la recomposition décorée fait revenir « Enregistrer »', async () => {
    const missing: GloryOffer = { tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2', { ready: false, missingBytes: 420_000 })], preselected: ref('savane.ambassadeur-2') };
    const { env: e, log, calls, releaseWarm } = offered(missing, { warm: 'later' });
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(log.rendered).toHaveLength(1);
    expect(log.saved).toHaveLength(1);
    expect(by(host, 'data-photo-save')).toBeNull();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe?.frameId).toBeUndefined();
    releaseWarm();
    await settle();
    expect(log.rendered).toHaveLength(2);
    expect(calls.filter((call) => call.scale === 1).at(-1)?.frame).toEqual(ref('royaumes.ambassadeur-2'));
    expect(by(host, 'data-photo-save')).not.toBeNull();
    expect(log.saved).toHaveLength(1);
  });
});
