import { describe, expect, test } from 'bun:test';

import { AMI, AUTRE, HOUR, makeWorld, PARIS, T0 } from '@/test-support/shared-location-sharing-world';

import { EMPTY_ROSTER, encodeSharedLocationRoster, rosterOps } from './shared-location-roster';

/**
 * **UN RETRAIT N'ENVOIE PAS LA POSITION DE CET ONGLET** (#19284 ⊂ #18580) : retirer une
 * personne ou laisser tomber une échéance republie la liste SANS position — la passerelle
 * reprend le point qu'elle garde. Un onglet qui n'a fait que recevoir la liste (ou dont la
 * permission est retirée) ne relève donc rien et ne remplace pas la position du téléphone.
 * Une passerelle d'avant refuse la charge (`invalid`) : l'onglet renvoie sa position, comme avant.
 */

const deuxPersonnes = () =>
  encodeSharedLocationRoster(
    rosterOps.adding(rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: T0 }), {
      userId: AUTRE,
      precision: 'city',
      durationMinutes: 60,
      now: T0,
    }),
  );

describe('retirer une personne', () => {
  test('la liste repart sans position et sans aucun relevé, même sur l’onglet qui publie', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    const releves = world.source.prompts;

    expect(await world.center.stopSharing(AMI)).toBeNull();

    expect(world.starts.at(-1)).toEqual({ recipients: [{ userId: AUTRE, precision: 'city' }], durationMinutes: 60 });
    expect(world.source.prompts).toBe(releves);
    expect(world.center.entry(AUTRE)).not.toBeNull();
    expect(world.source.following).toBe(1);
  });

  test('sans relevé possible (liste reprise d’un rechargement, permission retirée), l’autre personne GARDE son partage', async () => {
    const world = makeWorld({ stored: deuxPersonnes(), granted: false });
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.source.prompts).toBe(0);
    expect(world.stops()).toBe(0);
    expect(world.starts).toEqual([{ recipients: [{ userId: AUTRE, precision: 'city' }], durationMinutes: 60 }]);
    expect(world.center.entry(AUTRE)).not.toBeNull();
    expect(world.center.entry(AMI)).toBeNull();
  });

  test('une passerelle d’avant refuse la liste seule : l’onglet renvoie sa position, comme avant', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'invalid' }));

    expect(await world.center.stopSharing(AMI)).toBeNull();

    expect(world.starts.slice(-2)).toEqual([
      { recipients: [{ userId: AUTRE, precision: 'city' }], durationMinutes: 60 },
      { recipients: [{ userId: AUTRE, precision: 'city' }], durationMinutes: 60, position: PARIS },
    ]);
    expect(world.center.entry(AUTRE)).not.toBeNull();
  });

  test('la passerelle n’a plus de partage : rien à retirer chez personne, la liste se vide sans arrêt ni relevé', async () => {
    const world = makeWorld({ stored: deuxPersonnes(), granted: false });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'not-sharing' }));
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.source.prompts).toBe(0);
    expect(world.center.entry(AUTRE)).toBeNull();
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });
});

describe('une échéance', () => {
  test('une personne échue sort de la liste sans que l’onglet ne relève ni n’envoie sa position', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 480 });
    const releves = world.source.prompts;
    const envois = world.starts.length;

    await world.advance(HOUR + 60_000);

    const republications = world.starts.slice(envois);
    expect(republications.length).toBeGreaterThan(0);
    expect(republications.every((payload) => payload.position === undefined)).toBe(true);
    expect(world.source.prompts).toBe(releves);
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.center.entry(AUTRE)).not.toBeNull();
  });
});
