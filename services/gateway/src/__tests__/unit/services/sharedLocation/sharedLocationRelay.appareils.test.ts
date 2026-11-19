/**
 * PLUSIEURS APPAREILS D'UN MÊME COMPTE (#18389). La passerelle ne connaît qu'UN partage par
 * compte : c'est lui qui fait foi. Chaque appareil relit « mon partage » pour se recaler, et
 * n'y lit QUE ce que l'émetteur a lui-même choisi — à qui, à quelle précision, jusqu'à quand —,
 * jamais une position, jamais un verdict de cercle ou de blocage.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { ownSharedLocationFor, startSharedLocation, stopSharedLocation } from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, BLOQUEUR, CONNAISSANCE, EMETTEUR, HEURE, monde, PARIS, PROCHE, SANG, T0, TOUS, demarrer } from '../../../helpers/shared-location-relay-world';

const iso = (ms: number): string => new Date(ms).toISOString();
const AUCUN = { recipients: [], expiresAt: null };

describe('mon partage, tel que la passerelle le sert à mes appareils', () => {
  it('sans partage : personne, aucun terme', async () => {
    expect(await ownSharedLocationFor(monde().deps, EMETTEUR)).toEqual(AUCUN);
  });

  it('rend chaque personne choisie, sa précision et SON échéance, dans un ordre stable', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, {
      recipients: [{ userId: SANG, precision: 'city', expiresInSeconds: 1800 }, { userId: AMI, precision: 'exact' }, { userId: PROCHE }],
      durationMinutes: 60,
      position: PARIS,
    });

    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toEqual({
      recipients: [
        { userId: AMI, precision: 'exact', expiresAt: iso(T0 + HEURE) },
        { userId: PROCHE, precision: 'city', expiresAt: iso(T0 + HEURE) },
        { userId: SANG, precision: 'city', expiresAt: iso(T0 + HEURE / 2) },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
      expiresAt: iso(T0 + HEURE),
      shareBattery: false,
      startedAt: iso(T0),
    });
  });

  it('ne porte aucune position, ni maille, ni précision réelle de l\'appareil', async () => {
    const m = monde();
    await demarrer(m);
    const servi = JSON.stringify(await ownSharedLocationFor(m.deps, EMETTEUR));
    for (const fuite of ['48.85', '2.35', 'latitude', 'longitude', 'accuracy', 'cell', 'sessionId', 'position']) expect(servi).not.toContain(fuite);
  });

  it('garde la liste CHOISIE : un bloqueur et une Connaissance y restent, rien ne trahit leur verdict', async () => {
    const m = monde();
    await demarrer(m, TOUS);
    const ids = (await ownSharedLocationFor(m.deps, EMETTEUR)).recipients.map((r) => r.userId);
    expect(ids).toEqual(expect.arrayContaining([BLOQUEUR, CONNAISSANCE]));
    expect(ids).toHaveLength(TOUS.length);
  });

  it('une personne échue en sort ; le partage échu ou arrêté ne rend plus rien', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, expiresInSeconds: 600 }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.avancer(600_001);
    expect((await ownSharedLocationFor(m.deps, EMETTEUR)).recipients.map((r) => r.userId)).toEqual([PROCHE]);
    m.avancer(HEURE);
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toEqual(AUCUN);

    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toEqual(AUCUN);
  });

  it('un autre appareil qui redémarre sans une personne : la relecture ne la rend plus', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI }, { userId: PROCHE }]);
    await demarrer(m, [{ userId: PROCHE }]);
    expect((await ownSharedLocationFor(m.deps, EMETTEUR)).recipients.map((r) => r.userId)).toEqual([PROCHE]);
  });

  it('ne lit que le partage de l\'appelant', async () => {
    const m = monde();
    await demarrer(m);
    expect(await ownSharedLocationFor(m.deps, AMI)).toEqual(AUCUN);
  });
});

/**
 * UN SEUL APPAREIL PUBLIE (#18580, #18714). `startedAt` nomme le dernier démarrage AVEC position : l'accusé le rend à
 * l'appareil qui l'a fait, la relecture le sert à tous. Un appareil dont l'accusé porte un autre `startedAt` que celui
 * servi sait qu'un autre a partagé après lui, sans comparer d'horloges. La liste seule (aucune position) le garde.
 */
describe('l’identité du dernier « Partager »', () => {
  const startedAtOf = (ack: Awaited<ReturnType<typeof startSharedLocation>>): string | undefined =>
    ack.success ? ack.data.startedAt : undefined;

  it('l’accusé d’un démarrage avec position rend le `startedAt` que la relecture sert', async () => {
    const m = monde();
    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }], durationMinutes: 60, position: PARIS });
    expect(startedAtOf(ack)).toBe(iso(T0));
    expect((await ownSharedLocationFor(m.deps, EMETTEUR)).startedAt).toBe(iso(T0));
  });

  it('un autre démarrage avec position le renouvelle ; une liste seule le garde', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.avancer(1_000);
    const second = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    expect(startedAtOf(second)).toBe(iso(T0 + 1_000));
    m.avancer(1_000);
    const listOnly = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }], durationMinutes: 60 });
    expect(startedAtOf(listOnly)).toBe(iso(T0 + 1_000));
    expect((await ownSharedLocationFor(m.deps, EMETTEUR)).startedAt).toBe(iso(T0 + 1_000));
  });
});
