import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as z from 'zod/mini';
import { PackPresenceSchema, isPackPaintable, type PackPresence } from '../pack-presence';

const EVENT_TYPES = [
  'install',
  'start',
  'download',
  'progress',
  'complete',
  'integrity-error',
  'network-error',
  'no-space',
  'cancel',
  'space-freed',
  'session-start',
  'retry',
  'remove',
  'lease-released',
  'version-served',
] as const;

const EFFECTS = ['abort', 'delete-file', 'discard-partial', 'prune', 'prune-deferred', 'prune-previous', 'prune-previous-deferred'] as const;

const VectorSchema = z.object({
  name: z.string().check(z.minLength(1)),
  from: PackPresenceSchema,
  event: z.object({
    type: z.enum(EVENT_TYPES),
    totalBytes: z.optional(z.int().check(z.minimum(0))),
    doneBytes: z.optional(z.int().check(z.minimum(0))),
    version: z.optional(z.int().check(z.minimum(1))),
    origin: z.optional(z.enum(['local', 'remote'])),
  }),
  context: z.object({ network: z.enum(['unrestricted', 'constrained', 'offline']), lease: z.boolean(), embedded: z.boolean() }),
  to: PackPresenceSchema,
  effects: z.array(z.enum(EFFECTS)),
});
type Vector = z.infer<typeof VectorSchema>;

const raw = JSON.parse(readFileSync(resolve(__dirname, '../../design/packs/presence-vectors.json'), 'utf8')) as { vectors: unknown[] };
const vectors: readonly Vector[] = raw.vectors.map((v) => VectorSchema.parse(v));

const is = (presence: PackPresence, state: PackPresence['state']): boolean => presence.state === state;
const some = (predicate: (v: Vector) => boolean): boolean => vectors.some(predicate);

describe('les vecteurs de présence des packs — forme (§ 5.10.6)', () => {
  it('chaque vecteur est bien formé et le fichier entier se lit', () => {
    expect(vectors.length).toBe(raw.vectors.length);
    expect(vectors.length).toBeGreaterThan(30);
  });

  it('les noms sont uniques et la machine est déterministe', () => {
    expect(new Set(vectors.map((v) => v.name)).size).toBe(vectors.length);
    const keys = vectors.map((v) => JSON.stringify([v.from, v.event, v.context]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chaque genre d’événement et chaque état figurent', () => {
    expect(new Set(vectors.map((v) => v.event.type))).toEqual(new Set(EVENT_TYPES));
    expect(new Set(vectors.flatMap((v) => [v.from.state, v.to.state]))).toEqual(
      new Set(['absent', 'queued', 'downloading', 'ready', 'stale', 'failed']),
    );
  });

  it('couvre chaque transition que la spécification nomme', () => {
    const removeDuring = (origin: 'local' | 'remote') =>
      some((v) => is(v.from, 'downloading') && v.event.type === 'remove' && v.event.origin === origin && is(v.to, 'absent'));
    expect(removeDuring('local')).toBe(true);
    expect(removeDuring('remote')).toBe(true);
    expect(some((v) => is(v.from, 'downloading') && v.event.type === 'cancel' && v.to.state === 'queued' && v.to.reason === 'user')).toBe(true);
    expect(some((v) => v.from.state === 'failed' && v.from.cause === 'space' && is(v.to, 'queued'))).toBe(true);
    expect(some((v) => is(v.from, 'stale') && is(v.to, 'ready'))).toBe(true);
    expect(some((v) => is(v.from, 'stale') && v.context.network === 'offline' && is(v.to, 'stale'))).toBe(true);
    expect(some((v) => v.context.embedded && is(v.from, 'stale') && is(v.to, 'ready'))).toBe(true);
    expect(some((v) => v.context.lease && v.effects.includes('prune-deferred'))).toBe(true);
    expect(some((v) => v.event.type === 'download' && v.context.network === 'constrained' && is(v.to, 'downloading'))).toBe(true);
  });

  it('un échec d’intégrité ne repart jamais en boucle dans la même session', () => {
    const loops = vectors.filter(
      (v) => v.from.state === 'failed' && v.from.cause === 'integrity' && v.event.type !== 'session-start' && v.event.type !== 'remove' && !is(v.to, 'failed'),
    );
    expect(loops).toEqual([]);
  });

  it('sous bail, rien ne s’élague tout de suite', () => {
    const immediate = vectors.filter((v) => v.context.lease && (v.effects.includes('prune') || v.effects.includes('prune-previous')));
    expect(immediate).toEqual([]);
  });

  it('un pack peint ne cesse de l’être que par un retrait', () => {
    const lost = vectors.filter((v) => isPackPaintable(v.from) && !isPackPaintable(v.to) && v.event.type !== 'remove');
    expect(lost).toEqual([]);
  });

  it('rien ne télécharge hors ligne, et un réseau restreint n’ouvre un téléchargement que sur un geste', () => {
    const startsOffline = vectors.filter((v) => v.context.network === 'offline' && is(v.to, 'downloading') && !is(v.from, 'downloading'));
    const startsConstrained = vectors.filter(
      (v) => v.context.network === 'constrained' && is(v.to, 'downloading') && !is(v.from, 'downloading') && v.event.type !== 'download',
    );
    expect(startsOffline).toEqual([]);
    expect(startsConstrained).toEqual([]);
  });
});
