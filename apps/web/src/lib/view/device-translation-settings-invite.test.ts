import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { deviceTranslationPorts } from './device-translation-request';
import { SETTING_FOCUS_PARAM } from './setting-focus';

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/conversations/c-1' });
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

describe('« Activez Traduire sur cet appareil dans les réglages » (#16339)', () => {
  test('l’invite ouvre les réglages SUR la bascule de la traduction de l’appareil', () => {
    deviceTranslationPorts.openSettings();
    expect(window.location.pathname).toBe('/settings');
    expect(new URLSearchParams(window.location.search).get(SETTING_FOCUS_PARAM)).toBe('deviceTranslation');
  });
});
