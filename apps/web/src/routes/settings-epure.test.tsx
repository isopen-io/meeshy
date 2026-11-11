import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CIRCLE_NOTIFY_DEFAULTS } from '@meeshy/shared/utils/relation-levels';

import type { AppPreferences } from '@/lib/api/app-preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCircleNotifyCatalog } from '@/lib/i18n-circle-notify-catalog';
import { loadDeviceTranslationCatalog } from '@/lib/i18n-device-translation-catalog';
import { loadSessionsCatalog } from '@/lib/i18n-sessions-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CircleNotifySectionView } from './settings-circle-notify';
import { SettingsE2eeDevicesScreen } from './settings-e2ee-devices';
import { SettingsSecurityScreen } from './settings-security';
import { DataSection, NotificationsSection, PrivacySection, SettingsOfflineNotice, SettingsContent, type PreferencesView } from './settings-sections';

/**
 * L'ÉPURE DES RÉGLAGES (#17594, épure #17584) — un libellé NOMME, l'explication
 * passe derrière un (i) dont le nom est la QUESTION à laquelle la note répond,
 * la note reste lue repliée, et ce qui est rangé reste atteignable.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/settings' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([
    loadInterfaceCatalog('fr'),
    loadCircleNotifyCatalog('fr'),
    loadDeviceTranslationCatalog('fr'),
    loadSessionsCatalog('fr'),
  ]);
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

const text = (host: ParentNode): string => host.textContent ?? '';

describe('la confidentialité se lit en libellés', () => {
  test('chaque explication est derrière un (i) nommé par sa question, lue repliée', async () => {
    const host = await mount(
      <SettingsContent>
        <PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />
      </SettingsContent>,
    );
    for (const question of [
      'Que voient les autres de mon statut ?',
      'Pourquoi les accusés sont-ils réciproques ?',
      'Qui ne me retrouvera plus ?',
      'Qui peut me faire sonner ?',
      'Qui est prévenu de mon retour ?',
    ]) {
      const note = noteOf(host, infoButton(host, question));
      expect(note.className).toContain('sr-only');
      expect(note.textContent?.length ?? 0).toBeGreaterThan(20);
    }
  });

  test('les libellés du lexique remplacent les phrases', async () => {
    const host = await mount(<PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelector('[role="switch"][aria-label="Masquer mon numéro et mon e-mail"]')).not.toBeNull();
    expect(host.querySelector('[role="switch"][aria-label="Annoncer mon retour"]')).not.toBeNull();
    expect(text(host)).not.toContain('Ne pas me proposer');
    expect(text(host)).not.toContain('Prévenir mes contacts');
  });

  test('ouvrir une note la rend visible, un second toucher la referme', async () => {
    const host = await mount(
      <SettingsContent>
        <PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />
      </SettingsContent>,
    );
    const button = infoButton(host, 'Qui peut me faire sonner ?');
    await click(button);
    expect(noteOf(host, button).className).not.toContain('sr-only');
    await click(button);
    expect(noteOf(host, button).className).toContain('sr-only');
  });
});

describe('les notifications', () => {
  test('la rangée s’appelle « Push », le retour d’un contact se dit court', async () => {
    const host = await mount(<NotificationsSection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelector('[role="switch"][aria-label="Push"]')).not.toBeNull();
    expect(host.querySelector('[role="switch"][aria-label="Retour d’un contact"]')).not.toBeNull();
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
    const translation = noteOf(host, infoButton(host, 'Que fait la traduction sur cet appareil ?'));
    expect(translation.textContent).toContain('110 Mo');
    expect(translation.className).toContain('sr-only');
  });
});

describe('le bandeau hors ligne', () => {
  test('dit « Hors ligne » et range la suite derrière un (i)', async () => {
    const host = await mount(
      <SettingsContent>
        <SettingsOfflineNotice language="fr" />
      </SettingsContent>,
    );
    expect(host.querySelector('[data-settings-offline]')?.firstElementChild?.nextElementSibling?.textContent).toContain('Hors ligne');
    const note = noteOf(host, infoButton(host, 'Que puis-je faire hors ligne ?'));
    expect(note.textContent).toContain('réglages restent lisibles');
  });
});

describe('qui est prévenu', () => {
  test('le titre porte le verbe, les familles se disent court, l’explication d’un cran est derrière un (i)', async () => {
    const host = await mount(
      <SettingsContent>
        <CircleNotifySectionView
          language="fr"
          view={{ kind: 'ready', preferences: CIRCLE_NOTIFY_DEFAULTS }}
          disabled={false}
          onChoose={noop}
          onRetry={noop}
        />
      </SettingsContent>,
    );
    expect(host.querySelector('h2')?.textContent).toBe('PRÉVENIR');
    expect(text(host)).toContain('Sur mes contenus');
    expect(text(host)).toContain('Ailleurs');
    expect(text(host)).not.toContain('Choisissez, action par action');
    noteOf(host, infoButton(host, 'Qui reçoit ces notifications ?'));
  });
});

const sessionsDeps = (data: { sessions: never[] }) => ({
  load: async () => ({ ok: true as const, data: { ...data, geolocation: null } as never, status: 200 }),
  revoke: async () => ({ ok: true as const, data: null, status: 200 }),
  revokeOthers: async () => ({ ok: true as const, data: 0, status: 200 }),
});

describe('sécurité', () => {
  test('la liste vide tient en une ligne et l’introduction est derrière un (i)', async () => {
    const host = await mount(
      <SettingsSecurityScreen language="fr" deps={sessionsDeps({ sessions: [] })} queryClient={new QueryClient()} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(text(host)).toContain('Aucune session active');
    expect(text(host)).not.toContain('apparaîtront ici');
    expect(text(host)).not.toContain('Fermez toute session');
    noteOf(host, infoButton(host, 'À quoi sert cette liste ?'));
    expect(text(host)).toContain('CHIFFREMENT');
  });
});

describe('mes appareils chiffrés', () => {
  test('sans appareil : une ligne, l’explication derrière un (i) ; le navigateur est dit court', async () => {
    const queryClient = new QueryClient();
    const host = await mount(
      <SettingsE2eeDevicesScreen
        language="fr"
        host="browser"
        queryClient={queryClient}
        deps={{ load: async () => ({ ok: true, data: [], status: 200 }), retire: async () => ({ ok: true, data: null, status: 200 }) }}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(text(host)).toContain('Aucun appareil chiffré');
    expect(text(host)).toContain('Illisible dans ce navigateur');
    expect(text(host)).not.toContain('CHIFFREMENT DE BOUT EN BOUT');
    expect(text(host)).not.toContain('ne lit pas les conversations');
    expect(noteOf(host, infoButton(host, 'Où lire mes conversations chiffrées ?')).textContent).toContain('application Meeshy');
    expect(noteOf(host, infoButton(host, 'Comment ajouter un appareil ?')).textContent).toContain('Activez le chiffrement');
    expect(noteOf(host, infoButton(host, 'Comment approuver un appareil ?')).textContent).toContain('code');
    noteOf(host, infoButton(host, 'À quoi sert cette liste ?'));
  });
});
