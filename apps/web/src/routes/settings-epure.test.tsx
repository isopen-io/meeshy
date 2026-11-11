import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AppPreferences } from '@/lib/api/app-preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadDeviceTranslationCatalog } from '@/lib/i18n-device-translation-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DataSection, NotificationsSection, SettingsContent, type PreferencesView } from './settings-sections';

/**
 * L'ÉPURE DES RÉGLAGES (#17594, épure #17584) — ce qui est USUEL (permission de
 * notification, téléchargement automatique) se réduit au libellé, l'explication
 * derrière un (i) nommé par sa QUESTION. Ce qui est propre à Meeshy garde sa
 * phrase au repos : `settings-reperes.test.tsx` (règle 7) en est le témoin.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/settings' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadDeviceTranslationCatalog('fr')]);
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const preferences: AppPreferences = {
  theme: 'auto',
  pushEnabled: true,
  soundEnabled: true,
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  hideProfileFromSearch: false,
  acceptCallsFromNonContacts: true,
  notifyContactsOnReturn: true,
  contactActivityEnabled: true,
  gameEnabled: true,
  gamePhotoEnabled: true,
  saveMediaToGallery: false,
};
const ready: PreferencesView = { kind: 'ready', preferences };
const noop = () => undefined;

const infoButton = (host: ParentNode, question: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === question);
  if (button === undefined) throw new Error(`aucun (i) nommé « ${question} »`);
  return button;
};

const noteOf = (host: ParentNode, button: HTMLButtonElement): HTMLElement => {
  const id = button.getAttribute('aria-controls');
  const element = id === null ? null : host.querySelector<HTMLElement>(`[id="${id}"]`);
  if (element === null) throw new Error('note introuvable');
  return element;
};

/** Ce qu'on VOIT : les notes repliées (`sr-only`) sont lues, pas vues. */
const text = (host: HTMLElement): string => {
  const copy = host.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return copy.textContent ?? '';
};

describe('les notifications', () => {
  test('la rangée garde le mot d’iOS (« Notifications », même clé)', async () => {
    const host = await mount(<NotificationsSection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelector('[role="switch"][aria-label="Notifications"]')).not.toBeNull();
  });

  test('la permission refusée tient en quelques mots et garde son action', async () => {
    const host = await mount(
      <NotificationsSection
        language="fr"
        view={ready}
        disabled={false}
        onToggle={noop}
        onRetry={noop}
        device={{ permission: 'denied', openSettings: noop, enable: noop }}
      />,
    );
    expect(text(host)).toContain('Bloquées sur cet appareil');
    expect(text(host)).not.toContain('Les notifications sont bloquées');
    expect(host.querySelector('[data-device-push-action]')).not.toBeNull();
  });
});

describe('les données', () => {
  test('le téléchargement auto se nomme court, sa règle est derrière un (i)', async () => {
    const host = await mount(
      <SettingsContent>
        <DataSection language="fr" deviceTranslation={{ enabled: false, ready: true, onToggle: noop }} />
      </SettingsContent>,
    );
    expect(text(host)).toContain('Téléchargement auto');
    expect(text(host)).not.toContain('Téléchargement automatique des médias');
    const auto = noteOf(host, infoButton(host, 'Et si le téléchargement n’est pas automatique ?'));
    expect(auto.textContent).toContain('100 Ko');
  });
});
