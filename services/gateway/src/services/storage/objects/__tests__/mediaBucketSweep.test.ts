/**
 * #11267 — UN EFFACEMENT ATTEINT LE SEAU. Le seau ne garde que les clés
 * qu'une ligne de média VIVANTE nomme : un message purgé, un compte effacé,
 * une pièce jointe orpheline quittent le disque ET leur copie. Le balayage est
 * une PURGE : il échoue fermé (collecte incomplète, base vide, proportion
 * déraisonnable ⇒ rien n'est effacé), épargne les objets récents (une écriture
 * en double précède la ligne qui la nomme) et est à blanc par défaut.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { collectReferencedKeys, sweepBucket, type ListedObject } from '../mediaBucketSweep';
import type { MirrorRowSource } from '../mediaMirror';

const NOW = new Date('2026-10-23T12:00:00Z');
const OLD = new Date('2026-10-20T12:00:00Z');
const YOUNG = new Date('2026-10-23T11:00:00Z');
const GRACE_MS = 24 * 60 * 60 * 1000;

function bucket(objects: readonly ListedObject[]) {
  const removed: string[] = [];
  return {
    removed,
    lister: { list: async function* () { yield* objects; } },
    remover: { remove: async (key: string) => { removed.push(key); } },
  };
}

function source(name: string, rows: ReadonlyArray<{ id: string; filePath: string }>, failAfter?: string): MirrorRowSource {
  return {
    name,
    page: async (after, take) => {
      if (failAfter !== undefined && after === failAfter) throw new Error('base indisponible');
      const start = after === null ? 0 : rows.findIndex((row) => row.id === after) + 1;
      return rows.slice(start, start + take);
    },
  };
}

const LIVE = ['2026/10/u1/a.jpg', '2026/10/u1/b.mp4', '2026/10/u2/c.m4a'];
const live = (): ListedObject[] => LIVE.map((key) => ({ key, lastModified: OLD }));

describe('collectReferencedKeys — les clés que les lignes vivantes nomment', () => {
  it('parcourt toutes les pages de toutes les sources', async () => {
    const keys = await collectReferencedKeys({
      sources: [source('messageAttachment', [{ id: '1', filePath: LIVE[0]! }, { id: '2', filePath: LIVE[1]! }]), source('postMedia', [{ id: '3', filePath: LIVE[2]! }])],
      uploadRoot: '/srv/uploads',
      pageSize: 1,
    });
    expect([...keys].sort()).toEqual([...LIVE].sort());
  });

  it('une page en échec fait échouer la collecte — jamais un ensemble partiel', async () => {
    await expect(
      collectReferencedKeys({ sources: [source('messageAttachment', [{ id: '1', filePath: LIVE[0]! }, { id: '2', filePath: LIVE[1]! }], '1')], uploadRoot: '/srv/uploads', pageSize: 1 }),
    ).rejects.toThrow('base indisponible');
  });
});

describe('sweepBucket — le seau ne garde que ce qu’une ligne vivante nomme', () => {
  it('appliqué : efface la copie d’une clé que plus rien ne nomme, garde les autres', async () => {
    const b = bucket([...live(), { key: '2026/09/u9/purged.jpg', lastModified: OLD }]);
    const report = await sweepBucket({ ...b, referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true });
    expect(b.removed).toEqual(['2026/09/u9/purged.jpg']);
    expect(report).toEqual({ kind: 'swept', counts: { kept: 3, removed: 1, 'would-remove': 0, young: 0, failed: 0 } });
  });

  it('à blanc par défaut : compte, n’efface rien', async () => {
    const b = bucket([...live(), { key: '2026/09/u9/purged.jpg', lastModified: OLD }]);
    const report = await sweepBucket({ ...b, referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: false });
    expect(b.removed).toEqual([]);
    expect(report).toEqual({ kind: 'swept', counts: { kept: 3, removed: 0, 'would-remove': 1, young: 0, failed: 0 } });
  });

  it('épargne un objet plus récent que la grâce : l’écriture en double précède la ligne qui la nomme', async () => {
    const b = bucket([...live(), { key: '2026/10/u1/new.jpg', lastModified: YOUNG }, { key: '2026/10/u1/undated.jpg', lastModified: null }]);
    const report = await sweepBucket({ ...b, referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true });
    expect(b.removed).toEqual([]);
    expect(report.kind === 'swept' && report.counts.young).toBe(2);
  });

  it('refuse sur une base qui ne nomme aucune clé : une base vide ou mal configurée viderait le seau', async () => {
    const b = bucket(live());
    const report = await sweepBucket({ ...b, referenced: new Set(), now: NOW, graceMs: GRACE_MS, apply: true });
    expect(report).toEqual({ kind: 'refused', reason: 'no-referenced-key' });
    expect(b.removed).toEqual([]);
  });

  it('refuse d’effacer plus de la moitié du seau en un passage', async () => {
    const b = bucket([...live(), ...['x', 'y', 'z', 'w'].map((name) => ({ key: `2026/01/u0/${name}.jpg`, lastModified: OLD }))]);
    const report = await sweepBucket({ ...b, referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true });
    expect(report).toEqual({ kind: 'refused', reason: 'too-many-removals' });
    expect(b.removed).toEqual([]);
  });

  it('un effacement en échec est compté, le balayage continue', async () => {
    const removed: string[] = [];
    const report = await sweepBucket({
      lister: { list: async function* () { yield* [...live(), { key: '2026/09/u9/a.jpg', lastModified: OLD }]; } },
      remover: { remove: async (key: string) => { if (key.endsWith('a.jpg') && key.startsWith('2026/09')) throw new Error('panne'); removed.push(key); } },
      referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true,
    });
    expect(report.kind === 'swept' && report.counts.failed).toBe(1);
  });

  it('la sortie documentée du refus : une purge massive se demande explicitement, et passe', async () => {
    const b = bucket([...live(), ...['x', 'y', 'z', 'w'].map((name) => ({ key: `2026/01/u0/${name}.jpg`, lastModified: OLD }))]);
    const report = await sweepBucket({ ...b, referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true, allowMassRemoval: true });
    expect(report.kind === 'swept' && report.counts.removed).toBe(4);
  });

  it('le seau se parcourt en FLUX : un objet est effacé avant que le suivant ne soit énuméré, jamais le seau entier en mémoire (audit D5)', async () => {
    const events: string[] = [];
    const objects = [...live(), { key: '2026/09/u9/a.jpg', lastModified: OLD }, { key: '2026/09/u9/b.jpg', lastModified: OLD }];
    const report = await sweepBucket({
      lister: { list: async function* () { for (const object of objects) { events.push(`list:${object.key}`); yield object; } } },
      remover: { remove: async (key: string) => { events.push(`remove:${key}`); } },
      referenced: new Set(LIVE), now: NOW, graceMs: GRACE_MS, apply: true,
    });
    expect(report.kind === 'swept' && report.counts.removed).toBe(2);
    const secondPass = events.slice(objects.length);
    expect(secondPass.indexOf('remove:2026/09/u9/a.jpg')).toBeLessThan(secondPass.indexOf('list:2026/09/u9/b.jpg'));
  });
});
