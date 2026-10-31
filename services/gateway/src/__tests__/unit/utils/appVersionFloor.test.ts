/**
 * D-5 (#13947, lot #13954) — le plancher de version est PAR plateforme :
 * `MIN_APP_VERSION_IOS` / `MIN_APP_VERSION_ANDROID`, avec repli sur le
 * `MIN_APP_VERSION` global. iOS = 1.1.x, Android = 3.0.x, web = 2.0.x : un seul
 * numéro armé pour l'une bloquerait les autres. Le web (pwa) et la coque
 * Capacitor ne sont jamais jugés. Porte désarmée tant qu'aucun plancher n'est posé.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getAppVersionFloor, getAppVersionFloorFor } from '../../../utils/appVersion';
import {
  readRestVersionClaim,
  readSocketVersionClaim,
  upgradeRequirementFor,
} from '../../../middleware/app-version-floor';

const KEYS = ['MIN_APP_VERSION', 'MIN_APP_VERSION_IOS', 'MIN_APP_VERSION_ANDROID', 'APP_STORE_URL', 'PLAY_STORE_URL'] as const;

const withFloors = (floors: Partial<Record<(typeof KEYS)[number], string>>) =>
  KEYS.forEach((key) => {
    const value = floors[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

describe('plancher par plateforme', () => {
  const saved = KEYS.map((key) => [key, process.env[key]] as const);
  beforeEach(() => withFloors({}));
  afterEach(() =>
    saved.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    })
  );

  it('désarmé par défaut : aucune plateforme n’a de plancher', () => {
    expect(getAppVersionFloorFor('ios')).toBe('');
    expect(getAppVersionFloorFor('android')).toBe('');
    expect(getAppVersionFloorFor(undefined)).toBe('');
  });

  it('chaque plateforme lit son plancher, iOS n’arme pas Android', () => {
    withFloors({ MIN_APP_VERSION_IOS: '1.2.0' });
    expect(getAppVersionFloorFor('ios')).toBe('1.2.0');
    expect(getAppVersionFloorFor('android')).toBe('');
    withFloors({ MIN_APP_VERSION_ANDROID: '3.1.0' });
    expect(getAppVersionFloorFor('android')).toBe('3.1.0');
    expect(getAppVersionFloorFor('ios')).toBe('');
  });

  it('le plancher global sert de repli, le plancher de plateforme l’emporte', () => {
    withFloors({ MIN_APP_VERSION: '1.0.0', MIN_APP_VERSION_ANDROID: '3.1.0' });
    expect(getAppVersionFloorFor('ios')).toBe('1.0.0');
    expect(getAppVersionFloorFor('android')).toBe('3.1.0');
    expect(getAppVersionFloorFor(undefined)).toBe('1.0.0');
    expect(getAppVersionFloor()).toBe('1.0.0');
  });

  it('le web, la PWA et la coque Capacitor ne sont jamais jugés, même sous plancher global', () => {
    withFloors({ MIN_APP_VERSION: '9.0.0' });
    expect(['web', 'pwa', 'android-shell', ' PWA '].map(getAppVersionFloorFor)).toEqual(['', '', '', '']);
  });
});

describe('déclaration du client (REST et socket)', () => {
  it('REST : X-App-Version / X-App-Platform, repli X-Meeshy-Version / X-Meeshy-Platform', () => {
    expect(readRestVersionClaim({ 'x-app-version': '1.1.0', 'x-app-platform': 'ios' })).toEqual({ version: '1.1.0', platform: 'ios' });
    expect(readRestVersionClaim({ 'x-meeshy-version': '3.0.0', 'x-meeshy-platform': 'android' })).toEqual({ version: '3.0.0', platform: 'android' });
    expect(readRestVersionClaim({})).toEqual({ version: undefined, platform: undefined });
  });

  it('socket : handshake.auth.client, plateforme BRUTE (android n’est pas dans CLIENT_PLATFORMS)', () => {
    expect(readSocketVersionClaim({ client: { appVersion: '3.0.0', platform: 'android' } })).toEqual({ version: '3.0.0', platform: 'android' });
    expect(readSocketVersionClaim({ token: 'jwt' })).toEqual({ version: undefined, platform: undefined });
    expect(readSocketVersionClaim(null)).toEqual({ version: undefined, platform: undefined });
  });
});

describe('upgradeRequirementFor — l’exigence, ou null', () => {
  const saved = KEYS.map((key) => [key, process.env[key]] as const);
  beforeEach(() => withFloors({ MIN_APP_VERSION_IOS: '1.2.0', MIN_APP_VERSION_ANDROID: '3.1.0' }));
  afterEach(() =>
    saved.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    })
  );

  it('sous le plancher de SA plateforme ⇒ minVersion + storeUrl de sa boutique', () => {
    expect(upgradeRequirementFor({ version: '1.1.4', platform: 'ios' })).toEqual({
      minVersion: '1.2.0',
      storeUrl: 'https://apps.apple.com/app/id6760208591',
    });
    expect(upgradeRequirementFor({ version: '3.0.0', platform: 'android' })).toEqual({
      minVersion: '3.1.0',
      storeUrl: 'https://play.google.com/store/apps/details?id=me.meeshy.app',
    });
  });

  it('au plancher, au-dessus, sans version (web) ou web déclaré ⇒ null', () => {
    expect(upgradeRequirementFor({ version: '1.2.0', platform: 'ios' })).toBeNull();
    expect(upgradeRequirementFor({ version: '3.2.0', platform: 'android' })).toBeNull();
    expect(upgradeRequirementFor({ version: undefined, platform: 'ios' })).toBeNull();
    expect(upgradeRequirementFor({ version: '0.0.1', platform: 'pwa' })).toBeNull();
  });
});
