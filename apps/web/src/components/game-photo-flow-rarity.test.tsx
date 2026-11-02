import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';
import { gloryFramesFor, type GloryFrameOfferFrame, type GloryFrameOfferPack } from '@meeshy/shared/utils/game/glory-frames';

import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryScene, GloryStep } from '@/lib/game-photo/glory/glory-scene';
import { achievementMoment } from '@/lib/game-photo/moments';
import { choose, env, settle, setupGamePhotoFlowTests, takeFrame } from '@/test-support/game-photo-flow-harness';

const { click, open } = setupGamePhotoFlowTests();

/**
 * UN HAUT FAIT SE PHOTOGRAPHIE DANS SA RARETÉ (LS, #10168) — le BRANCHEMENT du
 * déroulé, pas la loi : la rareté que l'écran a le droit de montrer entre dans
 * l'étape remise à l'environnement, et la loi partagée, rejouée sur le manifeste
 * VERSIONNÉ du pack `succes`, peint le cadre de cette rareté. Sans rareté
 * servie, ou quand le cadre de la rareté est masqué, le neutre — jamais une
 * rareté supposée. Sans ce branchement, tout haut fait se repeindrait en
 * `succes.neutre`, en silence.
 */
const SUCCES = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..', 'packages', 'shared', 'design', 'glory-frames', 'succes.json');
const succesFrames = (JSON.parse(readFileSync(SUCCES, 'utf8')) as { readonly frames: readonly GloryFrameOfferFrame[] }).frames;

const succesPack = (hidden: ReadonlySet<string>): GloryFrameOfferPack => ({
  slug: 'succes',
  atmosphere: null,
  collections: ['succes'],
  frames: succesFrames.map((frame) => ({ ...frame, hidden: hidden.has(frame.id) })),
});

const sceneOf = (frameId: string): GloryScene => ({
  frame: { id: frameId } as unknown as GloryScene['frame'],
  pack: 'succes',
  crest: null,
  bannerLayout: () => null,
  paint: () => undefined,
  close: () => undefined,
});

function lawEnv(hidden: ReadonlySet<string> = new Set()) {
  const steps: GloryStep[] = [];
  const painted: (string | null)[] = [];
  const { env: base, log } = env();
  const value: PhotoEnv = {
    ...base,
    render: async (input) => {
      painted.push(input.glory?.scene.frame.id ?? null);
      return base.render(input);
    },
    glory: async ({ step }) => {
      steps.push(step);
      const offer = gloryFramesFor({ ...step, catalog: [succesPack(hidden)], installed: new Set(['succes']) });
      return offer.preselected === null ? null : sceneOf(offer.preselected.frameId);
    },
  };
  return { env: value, log, steps, painted };
}

async function photographed(rarity: AchievementRarity | undefined, hidden?: ReadonlySet<string>) {
  const { env: e, log, steps, painted } = lawEnv(hidden);
  const host = await open(achievementMoment('achievement.first_content', rarity), e, log);
  await click(choose(host, 'selfie'));
  await settle();
  await click(takeFrame(host));
  await settle();
  return { steps, painted };
}

describe('la rareté servie entre dans le déroulé (#10168)', () => {
  test('un haut fait à rareté visible remet SA rareté à l’environnement, et l’image se compose dans le cadre de cette rareté', async () => {
    const { steps, painted } = await photographed('rare');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.rarity === 'rare')).toBe(true);
    expect(painted).toEqual(['succes.rare']);
  });

  test('chaque rareté peint son propre cadre : une épopée ne se compose jamais dans le cadre rare', async () => {
    expect((await photographed('epic')).painted).toEqual(['succes.epic']);
    expect((await photographed('mythic')).painted).toEqual(['succes.mythic']);
  });

  test('sans rareté servie (l’écran n’a pas le droit de la montrer) : l’étape ne porte aucune rareté, l’image se compose dans le neutre', async () => {
    const { steps, painted } = await photographed(undefined);
    expect(steps.every((step) => (step.rarity ?? null) === null)).toBe(true);
    expect(painted).toEqual(['succes.neutre']);
  });

  test('une rareté dont le cadre est masqué se compose dans le neutre, jamais dans le cadre d’une autre rareté', async () => {
    const { steps, painted } = await photographed('legendary', new Set(['succes.legendary']));
    expect(steps.every((step) => step.rarity === 'legendary')).toBe(true);
    expect(painted).toEqual(['succes.neutre']);
  });
});
