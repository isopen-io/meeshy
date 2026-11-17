/**
 * #18910 (audit) — la fusion atomique couvre TOUS les écrivains des colonnes de préférences.
 *
 * Le `PATCH /me/preferences` fusionnait déjà dans la base ; trois écrivains lisaient encore la colonne, la
 * fusionnaient en mémoire puis la réécrivaient entière : la bascule de traduction automatique (`application`), les
 * réglages de clonage vocal (`audio`) et l'écriture par l'admin (toute catégorie). Une écriture concurrente entre
 * leur lecture et leur écriture était effacée.
 *
 * Le double de Prisma ci-dessous applique le pipeline de `atomicMergeCommand` comme Mongo le ferait, et laisse un
 * autre geste s'intercaler pendant une LECTURE de l'écrivain testé : c'est l'entrelacement qui perdait la clé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  mergeCategoriesAtomically,
  mergePreferenceKeysAtomically,
} from '../preference-atomic-merge';
import { writeAutoTranslateEnabled } from '../../../../utils/auto-translate-preference';

const USER = '64a000000000000000000001';

type Document = Record<string, Record<string, unknown> | null | undefined>;

type MergeStage = { $mergeObjects: [{ $literal: Record<string, unknown> }, unknown, { $literal: Record<string, unknown> }] };

function preferencesStore(initial: Document) {
  let row: Document | null = { ...initial };
  let interleave: (() => Promise<void>) | null = null;
  const objectOrEmpty = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const project = (select: Record<string, boolean>) =>
    Object.fromEntries(Object.keys(select).map((key) => [key, key === 'id' ? 'pref-1' : structuredClone(row?.[key] ?? null)]));

  const prisma = {
    userPreferences: {
      findUnique: async (args: { select: Record<string, boolean> }) => {
        const snapshot = row ? project(args.select) : null;
        const hook = interleave;
        interleave = null;
        if (hook) await hook();
        return snapshot;
      },
      upsert: async (args: { create: Document; update: Document; select?: Record<string, boolean> }) => {
        row = row ? { ...row, ...args.update } : { ...args.create };
        return project(args.select ?? { id: true });
      },
    },
    $runCommandRaw: async (command: { updates: Array<{ u: Array<{ $set: Record<string, MergeStage | string> }> }> }) => {
      if (!row) return { n: 0 };
      const set = command.updates[0].u[0].$set;
      Object.entries(set).forEach(([category, stage]) => {
        if (typeof stage === 'string') return;
        const [defaults, , submitted] = stage.$mergeObjects;
        row = { ...row, [category]: { ...defaults.$literal, ...objectOrEmpty(row?.[category]), ...submitted.$literal } };
      });
      return { n: 1, nModified: 1 };
    },
  };

  return {
    prisma,
    get row() { return row; },
    duringNextRead(hook: () => Promise<void>) { interleave = hook; },
  };
}

describe('les écrivains de préférences fusionnent dans la base (#18910, audit)', () => {
  it('la bascule de traduction automatique ne perd plus le thème choisi au même instant', async () => {
    const store = preferencesStore({ application: { theme: 'auto', fontSize: 'medium' } });
    store.duringNextRead(() =>
      mergePreferenceKeysAtomically(store.prisma as never, USER, 'application', { theme: 'dark' }).then(() => undefined));

    const served = await writeAutoTranslateEnabled(store.prisma as never, USER, false);

    expect(served).toBe(false);
    expect(store.row?.application).toEqual({ theme: 'dark', fontSize: 'medium', autoTranslateEnabled: false });
  });

  it('les réglages de clonage vocal ne perdent plus une clé audio écrite au même instant, et n’en effacent aucune', async () => {
    const store = preferencesStore({ audio: { transcriptionEnabled: true } });
    store.duringNextRead(() =>
      mergePreferenceKeysAtomically(store.prisma as never, USER, 'audio', { ttsSpeed: 1.25 }).then(() => undefined));

    await mergePreferenceKeysAtomically(store.prisma as never, USER, 'audio', { voiceCloningExaggeration: 0.4 });
    await mergePreferenceKeysAtomically(store.prisma as never, USER, 'audio', { voiceCloningCfgWeight: 0.6 });

    expect(store.row?.audio).toEqual({
      transcriptionEnabled: true, ttsSpeed: 1.25, voiceCloningExaggeration: 0.4, voiceCloningCfgWeight: 0.6,
    });
  });

  it('l’écriture par l’admin : la base relue (défauts, lignes héritées) ne comble que les clés absentes, la valeur vivante gagne', async () => {
    const store = preferencesStore({ privacy: { showOnlineStatus: false } });
    const staleBase = { showOnlineStatus: true, showLastSeen: true, allowContactRequests: true };
    const base = staleBase;

    await mergeCategoriesAtomically(store.prisma as never, USER, [{ category: 'privacy', defaults: base, submitted: { showLastSeen: false } }], { id: true, privacy: true });

    expect(store.row?.privacy).toEqual({ showOnlineStatus: false, showLastSeen: false, allowContactRequests: true });
  });
});
