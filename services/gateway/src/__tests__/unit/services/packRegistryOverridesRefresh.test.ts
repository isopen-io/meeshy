/**
 * #12329, R1 — UNE RELECTURE DES SURCHARGES QUI NE REND JAMAIS LA MAIN NE
 * MASQUE PAS LE REGISTRE POUR TOUJOURS, EN SILENCE. `refresh()` attendait une
 * lecture Prisma sans délai : pendue, elle gardait `inflight` posé, aucune
 * relecture ne repartait, et le registre restait masqué (fail-closed) jusqu'au
 * redémarrage sans que rien n'alerte. La relecture est désormais bornée, un
 * résultat tardif n'écrase jamais une lecture plus récente, et deux jauges
 * disent si le registre est masqué et l'âge de son instantané.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { PackRegistryOverrides } from '../../../services/packs/PackRegistryOverrides';
import { packRegistryMetrics } from '../../../services/metrics/packRegistryMetrics';

type Row = { domain: string; slug: string; override: unknown; revision: number };

function db(answers: Array<() => Promise<Row[]>>) {
  let call = 0;
  return {
    packRegistryEntry: {
      findMany: () => {
        const answer = answers[Math.min(call, answers.length - 1)]!;
        call += 1;
        return answer();
      },
    },
  } as never;
}

const never = () => new Promise<Row[]>(() => undefined);
const rows = (slug: string) => async () => [{ domain: 'banner', slug, override: { hidden: true }, revision: 1 }];

describe('refresh() est borné', () => {
  it('une base qui ne répond pas rend la main au bout du délai, et la relecture suivante peut aboutir', async () => {
    const overrides = new PackRegistryOverrides({ prisma: db([never, rows('aurore')]), refreshTimeoutMs: 30, ttlMs: 0 });

    await expect(overrides.refresh()).rejects.toThrow(/timeout/i);
    await overrides.refresh();

    expect(overrides.snapshot()?.has('banner.aurore')).toBe(true);
  });

  it('un résultat tardif n’écrase jamais une lecture plus récente', async () => {
    let releaseLate: (value: Row[]) => void = () => undefined;
    const late = () => new Promise<Row[]>((resolve) => { releaseLate = resolve; });
    const overrides = new PackRegistryOverrides({ prisma: db([late, rows('recent')]), refreshTimeoutMs: 30, ttlMs: 0 });

    await expect(overrides.refresh()).rejects.toThrow(/timeout/i);
    await overrides.refresh();
    releaseLate([{ domain: 'banner', slug: 'ancien', override: { hidden: true }, revision: 1 }]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(overrides.snapshot()?.has('banner.recent')).toBe(true);
    expect(overrides.snapshot()?.has('banner.ancien')).toBe(false);
  });
});

describe('les jauges du registre', () => {
  it('masqué tant qu’aucune lecture n’a abouti, puis l’âge de l’instantané', async () => {
    let now = 1_000_000;
    const overrides = new PackRegistryOverrides({ prisma: db([rows('aurore')]), now: () => new Date(now), ttlMs: 60_000 });
    const metrics = packRegistryMetrics(overrides);

    expect(await metrics.registry.metrics()).toMatch(/pack_registry_overrides_masked 1/);
    await overrides.refresh();
    now += 12_000;
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/pack_registry_overrides_masked 0/);
    expect(text).toMatch(/pack_registry_overrides_snapshot_age_seconds 12/);
  });
});
