import { describe, expect, test } from 'bun:test';

import { SMALL_MEDIA_AUTO_DOWNLOAD_BYTES } from '@meeshy/shared/utils/small-media-auto-download';

import {
  AUTO_DOWNLOAD_POLICIES,
  DEFAULT_MEDIA_DOWNLOAD_PREFERENCES,
  networkConditionOf,
  shouldAutoDownload,
  type AutoDownloadPolicy,
  type NetworkCondition,
} from './auto-download-policy';
import { createMediaDownloadStore, MEDIA_DOWNLOAD_STORAGE_KEY, parseMediaDownloadPreferences } from './media-download-preferences';

/**
 * **LE TÉLÉCHARGEMENT AUTOMATIQUE DES MÉDIAS** (#6333) — la table de vérité de
 * `MediaDownloadPolicyEngine` (iOS), le seuil du petit média (#14639) et la
 * politique tenue par l'appareil.
 */
const BIG = 2_400_000;

const decide = (policy: AutoDownloadPolicy, condition: NetworkCondition, sizeBytes: number | undefined = BIG) =>
  shouldAutoDownload({ kind: 'image', condition, preferences: { image: policy, video: 'never' }, sizeBytes });

describe('shouldAutoDownload — la table de vérité d’iOS', () => {
  test('toujours / Wi-Fi + bon cellulaire / Wi-Fi uniquement / jamais, sur les trois réseaux', () => {
    const table = AUTO_DOWNLOAD_POLICIES.map((policy) => [policy, (['wifi', 'goodCellular', 'poorCellular'] as const).map((condition) => decide(policy, condition))]);
    expect(table).toEqual([
      ['always', [true, true, true]],
      ['wifiAndGoodCellular', [true, true, false]],
      ['wifiOnly', [true, false, false]],
      ['never', [false, false, false]],
    ]);
  });

  test('hors ligne, rien ne part — pas même un petit média', () => {
    for (const policy of AUTO_DOWNLOAD_POLICIES) {
      expect(decide(policy, 'offline')).toBe(false);
      expect(decide(policy, 'offline', 1_000)).toBe(false);
    }
  });

  test('sous 100 Ko, le média part seul, quelle que soit la politique', () => {
    expect(decide('never', 'poorCellular', SMALL_MEDIA_AUTO_DOWNLOAD_BYTES - 1)).toBe(true);
    expect(decide('never', 'poorCellular', SMALL_MEDIA_AUTO_DOWNLOAD_BYTES)).toBe(false);
  });

  test('une taille absente ou nulle n’est PAS petite : la politique décide', () => {
    expect(decide('never', 'wifi', undefined)).toBe(false);
    expect(decide('never', 'wifi', 0)).toBe(false);
    expect(decide('always', 'poorCellular', undefined)).toBe(true);
  });

  test('chaque type lit SA politique', () => {
    const preferences = { image: 'always', video: 'never' } as const;
    expect(shouldAutoDownload({ kind: 'image', condition: 'wifi', preferences, sizeBytes: BIG })).toBe(true);
    expect(shouldAutoDownload({ kind: 'video', condition: 'wifi', preferences, sizeBytes: BIG })).toBe(false);
  });

  test('les défauts sont ceux d’iOS : images en Wi-Fi + bon cellulaire, vidéos en Wi-Fi seulement', () => {
    expect(DEFAULT_MEDIA_DOWNLOAD_PREFERENCES).toEqual({ image: 'wifiAndGoodCellular', video: 'wifiOnly' });
  });
});

describe('networkConditionOf — le réseau lu dans ce que le navigateur dit', () => {
  test('hors ligne d’abord', () => {
    expect(networkConditionOf({ online: false, connection: { type: 'wifi' } })).toBe('offline');
  });

  test('Wi-Fi ou filaire ⇒ wifi ; l’économiseur de données ⇒ cellulaire faible', () => {
    expect(networkConditionOf({ online: true, connection: { type: 'wifi' } })).toBe('wifi');
    expect(networkConditionOf({ online: true, connection: { type: 'ethernet' } })).toBe('wifi');
    expect(networkConditionOf({ online: true, connection: { type: 'wifi', saveData: true } })).toBe('poorCellular');
  });

  test('cellulaire : 4g ⇒ bon, 3g et moins ⇒ faible', () => {
    expect(networkConditionOf({ online: true, connection: { type: 'cellular', effectiveType: '4g' } })).toBe('goodCellular');
    expect(networkConditionOf({ online: true, connection: { type: 'cellular', effectiveType: '3g' } })).toBe('poorCellular');
    expect(networkConditionOf({ online: true, connection: { effectiveType: 'slow-2g' } })).toBe('poorCellular');
  });

  test('un navigateur muet (Safari, Firefox) se lit « bon cellulaire » : les défauts y gardent le fil d’avant', () => {
    expect(networkConditionOf({ online: true })).toBe('goodCellular');
  });
});

describe('la politique tenue par l’appareil', () => {
  const memory = (initial: Record<string, string> = {}) => {
    const entries = new Map(Object.entries(initial));
    return {
      entries,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    };
  };

  test('rien d’écrit, une valeur illisible ou inconnue ⇒ le défaut de son type', () => {
    expect(parseMediaDownloadPreferences(null)).toEqual(DEFAULT_MEDIA_DOWNLOAD_PREFERENCES);
    expect(parseMediaDownloadPreferences('{oops')).toEqual(DEFAULT_MEDIA_DOWNLOAD_PREFERENCES);
    expect(parseMediaDownloadPreferences(JSON.stringify({ image: 'never', video: 'souvent' }))).toEqual({ image: 'never', video: 'wifiOnly' });
  });

  test('un choix s’applique aussitôt et se relit au démarrage suivant', () => {
    const storage = memory();
    const store = createMediaDownloadStore(storage);
    store.setPolicy('image', 'never');
    expect(store.getState()).toEqual({ image: 'never', video: 'wifiOnly' });
    expect(createMediaDownloadStore(storage).getState()).toEqual({ image: 'never', video: 'wifiOnly' });
    expect(storage.entries.has(MEDIA_DOWNLOAD_STORAGE_KEY)).toBe(true);
  });
});
