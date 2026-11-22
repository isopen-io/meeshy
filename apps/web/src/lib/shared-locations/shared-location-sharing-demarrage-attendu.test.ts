import { SHARED_LOCATION_ERROR_CODES, SHARED_LOCATION_RECIPIENTS_MAX } from '@meeshy/shared/types/shared-location-constants';
import { describe, expect, test } from 'bun:test';

import { decodeOwnSharedLocation } from '@/lib/api/shared-locations';
import { AMI, AUTRE, HOUR, makeWorld, PARIS, T0 } from '@/test-support/shared-location-sharing-world';

import type { SharedLocationPointReplacement } from './shared-location-point-replacement';
import { readSharedLocationAck, sharedLocationPayloadWithoutDeadlines, sharedLocationStartPayloadOf } from './shared-location-sending';

/**
 * **LA CONFIRMATION VOYAGE JUSQU'À LA PASSERELLE** (#20249, moitié web ; passerelle #20329). « Montrer votre position
 * réelle ? » vaut pour le partage montré (#20248) ; entre la relecture de la réponse et l'envoi, un autre appareil du
 * compte peut encore démarrer. Quand la passerelle l'annonce (`acceptsExpectedStart`), le démarrage nomme le partage
 * remplacé (`expectedStartedAt`, le `startedAt` tel que servi) ; si elle répond qu'un autre a démarré
 * (`STARTED_ELSEWHERE`, partage arrêté compris), rien n'a été appliqué : l'onglet relit et repose la question, sans
 * jamais renvoyer la charge sans la clé.
 */

const iso = (ms: number): string => new Date(ms).toISOString();
const TROISIEME = 'd'.repeat(24);
const S1 = '2026-11-14T07:00:00.000Z';
const S2 = '2026-11-14T07:30:00.000Z';
const partage = { userId: TROISIEME, precision: 'city', durationMinutes: 60 } as const;
const askedBy = (answer: unknown): SharedLocationPointReplacement => {
  if (typeof answer !== 'object' || answer === null || !('asked' in answer)) throw new Error(`pas une question : ${String(answer)}`);
  return (answer as { readonly asked: SharedLocationPointReplacement }).asked;
};
const served = ({ startedAt, source = 'manual', announces = true, ids = [AMI] }: { readonly startedAt?: string; readonly source?: 'manual' | 'device'; readonly announces?: boolean; readonly ids?: readonly string[] }) => ({
  recipients: ids.map((userId) => ({ userId, precision: 'city' as const, expiresAt: iso(T0 + HOUR) })),
  expiresAt: ids.length === 0 ? null : iso(T0 + HOUR),
  ...(ids.length === 0 ? {} : { source }),
  ...(startedAt === undefined ? {} : { startedAt }),
  ...(announces ? { acceptsExpectedStart: true } : {}),
});

const devantUnPoint = async (shown: ReturnType<typeof served>) => {
  const world = makeWorld({ served: shown });
  await world.center.sync();
  const asked = askedBy(await world.center.share(partage));
  return { world, asked };
};

describe('le contrat du fil nomme le partage remplacé', () => {
  test('la clé part avec un remplacement de point choisi, et seulement alors', () => {
    const recipients = [{ userId: AMI, precision: 'city' as const }];
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: PARIS, replacesChosenPoint: true, expectedStartedAt: S1 })?.expectedStartedAt).toBe(S1);
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: PARIS, expectedStartedAt: S1 })?.expectedStartedAt).toBeUndefined();
    expect(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: null, replacesChosenPoint: true, expectedStartedAt: S1 })?.expectedStartedAt).toBeUndefined();
    expect(Object.keys(sharedLocationStartPayloadOf({ recipients, durationMinutes: 60, fix: PARIS, replacesChosenPoint: true }) ?? {})).not.toContain('expectedStartedAt');
  });

  test('le refus « démarré ailleurs » se lit comme tel, jamais comme un échec générique', () => {
    expect(readSharedLocationAck({ success: false, code: SHARED_LOCATION_ERROR_CODES.STARTED_ELSEWHERE })).toEqual({ kind: 'refused', outcome: 'started-elsewhere' });
  });

  test('la relecture lit l’annonce : vraie telle quelle, toute autre valeur comme absente', () => {
    const row = { userId: AMI, precision: 'city', expiresAt: iso(T0 + HOUR) };
    expect(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, acceptsExpectedStart: true })?.acceptsExpectedStart).toBe(true);
    expect(Object.keys(decodeOwnSharedLocation({ recipients: [row], expiresAt: null, acceptsExpectedStart: 'yes' }) ?? {})).not.toContain('acceptsExpectedStart');
    expect(Object.keys(decodeOwnSharedLocation({ recipients: [row], expiresAt: null }) ?? {})).not.toContain('acceptsExpectedStart');
  });
});

describe('une réponse nomme le partage montré quand la passerelle l’accepte', () => {
  test('le démarrage porte le `startedAt` tel que servi', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    expect(await world.center.share({ ...partage, replacing: asked })).toBeNull();
    expect(world.starts.at(-1)?.source).toBe('device');
    expect(world.starts.at(-1)?.expectedStartedAt).toBe(S1);
  });

  test('une passerelle qui ne l’annonce pas reçoit la charge d’avant, sans la clé', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1, announces: false }));
    expect(await world.center.share({ ...partage, replacing: asked })).toBeNull();
    expect(world.starts.at(-1)?.source).toBe('device');
    expect(Object.keys(world.starts.at(-1) ?? {})).not.toContain('expectedStartedAt');
  });

  test('un partage servi sans démarrage nommé : rien à nommer, la clé ne part pas', async () => {
    const { world, asked } = await devantUnPoint(served({}));
    expect(await world.center.share({ ...partage, replacing: asked })).toBeNull();
    expect(Object.keys(world.starts.at(-1) ?? {})).not.toContain('expectedStartedAt');
  });

  test('un « Partager » ordinaire, sans point choisi, ne nomme rien', async () => {
    const world = makeWorld({ served: served({ startedAt: S1, source: 'device' }) });
    await world.center.sync();
    expect(await world.center.share(partage)).toBeNull();
    expect(Object.keys(world.starts.at(-1) ?? {})).not.toContain('expectedStartedAt');
  });
});

describe('« démarré ailleurs » : rien n’a été appliqué, l’onglet relit et redemande', () => {
  test('un autre point choisi a démarré : la question se repose datée du partage relu, un seul envoi', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    world.startQueue.push(async () => {
      world.server.served = served({ startedAt: S2, ids: [AMI, AUTRE] });
      return { kind: 'refused', outcome: 'started-elsewhere' };
    });
    expect(askedBy(await world.center.share({ ...partage, replacing: asked }))).toEqual({ startedAt: S2, recipientIds: [AMI, AUTRE].sort() });
    expect(world.starts.length).toBe(1);
    expect(world.source.following).toBe(0);
    expect(world.center.entry(TROISIEME)).toBeNull();
  });

  test('la nouvelle réponse nomme le nouveau partage', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    world.startQueue.push(async () => {
      world.server.served = served({ startedAt: S2 });
      return { kind: 'refused', outcome: 'started-elsewhere' };
    });
    const again = askedBy(await world.center.share({ ...partage, replacing: asked }));
    expect(await world.center.share({ ...partage, replacing: again })).toBeNull();
    expect(world.starts.at(-1)?.expectedStartedAt).toBe(S2);
  });

  test('le partage s’est arrêté ailleurs : rien ne repart tout seul, la liste suit le partage servi', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    world.startQueue.push(async () => {
      world.server.served = served({ ids: [] });
      return { kind: 'refused', outcome: 'started-elsewhere' };
    });
    expect(await world.center.share({ ...partage, replacing: asked })).toBe('started-elsewhere');
    expect(world.starts.length).toBe(1);
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.center.entry(TROISIEME)).toBeNull();
    expect(world.source.following).toBe(0);
  });

  test('une passerelle revenue en arrière refuse la clé : l’onglet relit et redemande, jamais sans la clé', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    world.startQueue.push(async () => {
      world.server.served = served({ startedAt: S1, announces: false });
      return { kind: 'refused', outcome: 'invalid' };
    });
    expect(askedBy(await world.center.share({ ...partage, replacing: asked }))).toEqual({ startedAt: S1, recipientIds: [AMI] });
    expect(world.starts.length).toBe(1);
    expect(world.starts.every((start) => start.expectedStartedAt === S1)).toBe(true);
  });

  test('une relecture en panne après le refus : hors ligne, rien d’autre ne part', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: S1 }));
    world.startQueue.push(async () => {
      world.server.served = null;
      return { kind: 'refused', outcome: 'started-elsewhere' };
    });
    expect(await world.center.share({ ...partage, replacing: asked })).toBe('offline');
    expect(world.starts.length).toBe(1);
  });
});

describe('les gardes de la relance tiennent (audit du lot)', () => {
  const START = '2026-11-14T07:00:00.000Z';
  const ids = (count: number): readonly string[] => Array.from({ length: count }, (_, index) => index.toString(16).padStart(24, 'e'));

  test('une charge que l’onglet refuse lui-même (au-delà du plafond) rend un échec, jamais la même question en boucle', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: START, ids: ids(SHARED_LOCATION_RECIPIENTS_MAX) }));
    expect(await world.center.share({ ...partage, replacing: asked })).toBe('invalid');
    expect(world.starts).toEqual([]);
  });

  test('un refus INVALID d’une réponse partie SANS la clé n’est pas lu comme un refus de la clé', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: START, announces: false }));
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'invalid' }));
    expect(await world.center.share({ ...partage, replacing: asked })).toBe('invalid');
  });

  test('un démarrage servi qui n’est pas un instant ISO ne se nomme pas : la passerelle le refuserait en boucle', async () => {
    const { world, asked } = await devantUnPoint(served({ startedAt: '2026-11-14T07:00:00+00:00' }));
    expect(await world.center.share({ ...partage, replacing: asked })).toBeNull();
    expect(Object.keys(world.starts.at(-1) ?? {})).not.toContain('expectedStartedAt');
  });

  test('le repli sans échéances d’une passerelle d’avant #18205 garde la clé', () => {
    const payload = sharedLocationStartPayloadOf({ recipients: [{ userId: AMI, precision: 'city', expiresInSeconds: 600 }], durationMinutes: 60, fix: PARIS, replacesChosenPoint: true, expectedStartedAt: START });
    expect(payload === null ? null : sharedLocationPayloadWithoutDeadlines(payload)?.expectedStartedAt).toBe(START);
  });

});
