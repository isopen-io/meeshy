/**
 * LA CARTE DE TOUS MES PROCHES EN UN APPEL (#19202) : `GET /relations/locations?include=blood,ended`
 * rassemble les partages en cours (comme avant), le dernier point de chaque Sang et les partages
 * terminés. Sans `include`, la réponse est celle d'un ancien client ; drapeau du Sang éteint, ni
 * entrée ni champ ; l'emprise vaut pour les points Sang comme pour les partages ; une personne déjà
 * sur la carte n'est pas redite « pas sur la carte ».
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import type { SharedLocationBloodItem, SharedLocationEndedItem, SharedLocationSnapshot } from '@meeshy/shared/types/shared-location';
import { composeRelativesMap } from '../../../../services/sharedLocation/relativesMap';
import { relationLocationsResponseSchema } from '../../../../routes/relations/locations';

const MINA = '6300000000000000000000b1';
const YUKI = '6300000000000000000000f1';
const LEO = '6300000000000000000000c1';
const LOIN = '6300000000000000000000b2';

const partage = { userId: LEO, latitude: 38.71, longitude: -9.14, precision: 'neighborhood', radiusMeters: 1200, circle: 'CLOSE', updatedAt: '2026-11-17T10:00:00.000Z', expiresAt: '2026-11-17T11:00:00.000Z' } as const;
const mina: SharedLocationBloodItem = { userId: MINA, latitude: 38.7105, longitude: -9.1366, accuracy: 6, recordedAt: '2026-11-17T10:05:00.000Z', circle: 'BLOOD' };
const loin: SharedLocationBloodItem = { userId: LOIN, latitude: 48.85, longitude: 2.35, recordedAt: '2026-11-17T10:05:00.000Z', circle: 'BLOOD' };
const yuki: SharedLocationEndedItem = { userId: YUKI, endedAt: '2026-11-17T09:00:00.000Z', circle: 'FRIEND' };
const LISBONNE = { minLongitude: -9.3, minLatitude: 38.6, maxLongitude: -9.0, maxLatitude: 38.8 };

function sources(overrides: { readonly bloodEnabled?: boolean; readonly ended?: readonly SharedLocationEndedItem[] } = {}) {
  const appels = { blood: 0, ended: 0 };
  return {
    appels,
    sources: {
      snapshot: async (): Promise<SharedLocationSnapshot> => ({ items: [partage] }),
      blood: async () => {
        appels.blood += 1;
        return [mina, loin];
      },
      ended: async () => {
        appels.ended += 1;
        return overrides.ended ?? [yuki];
      },
      bloodEnabled: overrides.bloodEnabled ?? true,
    },
  };
}

describe('un appel, trois rubriques', () => {
  it('sans `include` : la réponse d\'avant, et rien d\'autre n\'est lu', async () => {
    const { sources: s, appels } = sources();
    const map = await composeRelativesMap(s, { include: { blood: false, ended: false } });

    expect(map).toEqual({ items: [partage] });
    expect(appels).toEqual({ blood: 0, ended: 0 });
  });

  it('`include=blood,ended` : les partages, le dernier point de chaque Sang et les partages terminés', async () => {
    const { sources: s } = sources();
    const map = await composeRelativesMap(s, { include: { blood: true, ended: true } });

    expect(map).toEqual({ items: [partage], blood: [mina, loin], ended: [yuki] });
  });

  it('drapeau du Sang éteint : aucune entrée Sang, aucun champ `blood`, rien n\'est lu', async () => {
    const { sources: s, appels } = sources({ bloodEnabled: false });
    const map = await composeRelativesMap(s, { include: { blood: true, ended: true } });

    expect(map).not.toHaveProperty('blood');
    expect(appels.blood).toBe(0);
    expect(map.ended).toEqual([yuki]);
  });

  it('l\'emprise filtre les points Sang sur la position servie', async () => {
    const { sources: s } = sources();
    const map = await composeRelativesMap(s, { bbox: LISBONNE, include: { blood: true, ended: false } });

    expect(map.blood).toEqual([mina]);
  });

  it('une personne déjà sur la carte n\'est pas redite « pas sur la carte »', async () => {
    const { sources: s } = sources({ ended: [yuki, { userId: LEO, endedAt: '2026-11-17T09:30:00.000Z' }, { userId: MINA, endedAt: '2026-11-17T09:40:00.000Z' }] });
    const map = await composeRelativesMap(s, { include: { blood: true, ended: true } });

    expect(map.ended).toEqual([yuki]);
  });
});

describe('la forme servie — déclarée champ par champ', () => {
  const serialize = fastJson(relationLocationsResponseSchema as unknown as Parameters<typeof fastJson>[0]);

  it('les trois rubriques traversent le sérialiseur', () => {
    const body = { success: true, data: { items: [partage], blood: [mina], ended: [yuki] } };
    expect(JSON.parse(serialize(body))).toEqual(body);
  });

  it('rien ne part à côté : un point Sang sans scellé ni masque, une fin sans position', () => {
    const fuyant = {
      success: true,
      data: {
        items: [partage],
        blood: [{ ...mina, sealed: 'v1:x', hiddenFrom: [YUKI], implausible: true, precision: 'exact' }],
        ended: [{ ...yuki, latitude: 48.85, longitude: 2.35, precision: 'exact', expiresAt: 'x' }],
      },
    };
    expect(JSON.parse(serialize(fuyant))).toEqual({ success: true, data: { items: [partage], blood: [mina], ended: [yuki] } });
  });

  it('un ancien client lit la même forme qu\'avant', () => {
    expect(JSON.parse(serialize({ success: true, data: { items: [partage] } }))).toEqual({ success: true, data: { items: [partage] } });
  });
});
