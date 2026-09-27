import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { fixtureAppPreferences } from '@/lib/api/fixtures-app-preferences';
import type { DevicePushPermission } from '@/lib/push/device-permission';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { NotificationsSection } from './settings-sections';

/**
 * **LE REFUS DE LA PERMISSION ANDROID EST UN ÉTAT DESSINÉ** (#7307, critère 4).
 * La rangée dit que CET appareil ne recevra rien, et son bouton est le chemin
 * de retour ; une permission accordée n'ajoute rien.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

function section(permission: DevicePushPermission | null) {
  const gestures: string[] = [];
  const device =
    permission === null
      ? null
      : { permission, enable: () => gestures.push('enable'), openSettings: () => gestures.push('open-settings') };
  const view = { kind: 'ready', preferences: fixtureAppPreferences() } as const;
  const element = (
    <NotificationsSection language="fr" view={view} disabled={false} onToggle={() => undefined} onRetry={() => undefined} device={device} />
  );
  return { element, gestures };
}

describe('NotificationsSection — la permission de l’appareil', () => {
  test('refusée : la rangée le dit et ouvre les réglages système', async () => {
    const { element, gestures } = section('denied');
    const host = await mount(element);
    const row = host.querySelector('[data-device-push="denied"]');
    expect(row?.textContent).toContain('Les notifications sont bloquées sur cet appareil');
    const action = row?.querySelector<HTMLButtonElement>('[data-device-push-action]') ?? null;
    expect(action?.textContent).toBe('Ouvrir les réglages');
    if (action !== null) await click(action);
    expect(gestures).toEqual(['open-settings']);
  });

  test('jamais demandée : « Activer » ouvre le dialogue', async () => {
    const { element, gestures } = section('prompt');
    const host = await mount(element);
    const action = host.querySelector<HTMLButtonElement>('[data-device-push="prompt"] [data-device-push-action]');
    expect(action?.textContent).toBe('Activer');
    if (action !== null) await click(action);
    expect(gestures).toEqual(['enable']);
  });

  test('accordée, ou hors coque : aucune rangée de plus', async () => {
    expect((await mount(section('granted').element)).querySelector('[data-device-push]')).toBeNull();
    expect((await mount(section(null).element)).querySelector('[data-device-push]')).toBeNull();
  });
});
