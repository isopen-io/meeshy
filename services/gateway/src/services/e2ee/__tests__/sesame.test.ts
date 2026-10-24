import { compareDeviceSets } from '../sesame';

const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);

const device = (userId: string, deviceId: number, registrationId: number) => ({ userId, deviceId, registrationId });

const directory = [device(ALICE, 1, 100), device(ALICE, 2, 200), device(BOB, 1, 300), device(BOB, 3, 301)];

describe('Sesame : comparaison des appareils adressés à l’annuaire (spec § 3.4)', () => {
  it("rend un écart vide quand chaque appareil actif sauf l'émetteur reçoit son enveloppe", () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(ALICE, 2, 200), device(BOB, 1, 300), device(BOB, 3, 301)],
      excludedOwnDevices: [],
    });
    expect(result).toEqual({ missing: [], extra: [], stale: [] });
  });

  it("signale l'appareil manquant, y compris un autre appareil de l'émetteur", () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(BOB, 1, 300), device(BOB, 3, 301)],
      excludedOwnDevices: [],
    });
    expect(result.missing).toEqual([{ userId: ALICE, deviceId: 2 }]);
  });

  it("signale en trop un appareil inconnu, retiré, ou l'appareil émetteur lui-même", () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(ALICE, 1, 100), device(ALICE, 2, 200), device(BOB, 1, 300), device(BOB, 3, 301), device(BOB, 9, 5)],
      excludedOwnDevices: [],
    });
    expect(result.extra).toEqual([{ userId: ALICE, deviceId: 1 }, { userId: BOB, deviceId: 9 }]);
    expect(result.missing).toEqual([]);
  });

  it('signale périmé un appareil dont le registrationId a changé (réinstallation)', () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(ALICE, 2, 200), device(BOB, 1, 999), device(BOB, 3, 301)],
      excludedOwnDevices: [],
    });
    expect(result.stale).toEqual([{ userId: BOB, deviceId: 1 }]);
  });

  it('compte deux enveloppes vers le même appareil comme une enveloppe en trop', () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(ALICE, 2, 200), device(BOB, 1, 300), device(BOB, 1, 300), device(BOB, 3, 301)],
      excludedOwnDevices: [],
    });
    expect(result.extra).toEqual([{ userId: BOB, deviceId: 1 }]);
  });

  it("n'exige pas d'enveloppe pour un de MES appareils non approuvés (§ 3.5)", () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(BOB, 1, 300), device(BOB, 3, 301)],
      excludedOwnDevices: [2],
    });
    expect(result).toEqual({ missing: [], extra: [], stale: [] });
  });

  it("refuse en trop une enveloppe adressée à un appareil que l'émetteur vient de déclarer non approuvé", () => {
    const result = compareDeviceSets({
      directory,
      sender: { userId: ALICE, deviceId: 1 },
      addressed: [device(ALICE, 2, 200), device(BOB, 1, 300), device(BOB, 3, 301)],
      excludedOwnDevices: [2],
    });
    expect(result.extra).toEqual([{ userId: ALICE, deviceId: 2 }]);
  });
});
