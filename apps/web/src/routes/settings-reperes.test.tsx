import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CIRCLE_NOTIFY_DEFAULTS } from '@meeshy/shared/utils/relation-levels';

import { PackShop } from '@/components/pack-shop';
import { stickerShopAdapter, stickerShopHintNote } from '@/components/composer-sticker-shop';
import { PackSubmitEditor } from '@/components/sticker-pack-submit';
import type { ActiveSession, ActiveSessions } from '@/lib/api/account-security';
import type { AppPreferences } from '@/lib/api/app-preferences';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { E2eeDevice } from '@/lib/api/e2ee-devices';
import { appQueryClient } from '@/lib/api/query-client';
import { PACK_CATALOGUE_QUERY_KEY, resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCircleNotifyCatalog } from '@/lib/i18n-circle-notify-catalog';
import { loadDeviceTranslationCatalog } from '@/lib/i18n-device-translation-catalog';
import { loadSessionsCatalog } from '@/lib/i18n-sessions-catalog';
import { loadStickerPacksCatalog, translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DataExportPage } from './data-export';
import { CircleNotifySectionView } from './settings-circle-notify';
import { SettingsE2eeDevicesScreen } from './settings-e2ee-devices';
import { EmailNotificationsPage } from './settings-notifications';
import { SettingsSecurityScreen } from './settings-security';
import { AppearanceSection, DataSection, NotificationsSection, PrivacySection, SettingsContent, SettingsOfflineNotice, type PreferencesView } from './settings-sections';
import { VerifyEmailChangePage } from './verify-email-change';

/**
 * LES REPÈRES RESTENT (règle 7 de l'épure #17584, retour porteur du 2026-11-11,
 * #17594) — ce qui est propre à Meeshy ou touche à la sécurité du compte garde,
 * LISIBLE AU REPOS et sans aucun geste, la phrase qui dit ce que c'est et ce que
 * ça fait. Une liste à surveiller montre de quoi reconnaître chaque ligne : son
 * nom, ses dates et la pastille « Cet appareil ».
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/settings' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([
    loadInterfaceCatalog('fr'),
    loadCircleNotifyCatalog('fr'),
    loadDeviceTranslationCatalog('fr'),
    loadSessionsCatalog('fr'),
    loadStickerPacksCatalog('fr'),
  ]);
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  unmountAll();
  appQueryClient.clear();
  resetFixturePacksForTests();
});

/** Ce qu'on LIT sans geste : ni note repliée (`sr-only`), ni contenu d'un « Plus » fermé (absent du DOM). */
const atRest = (host: Element | null): string => {
  if (host === null) throw new Error('élément introuvable');
  const copy = host.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return copy.textContent ?? '';
};

const infoButton = (host: ParentNode, question: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === question);
  if (button === undefined) throw new Error(`aucun (i) nommé « ${question} »`);
  return button;
};

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
  bringEnabled: true,
  gameEnabled: true,
  gamePhotoEnabled: true,
  saveMediaToGallery: false,
};
const ready: PreferencesView = { kind: 'ready', preferences };
const noop = () => undefined;

describe('confidentialité : chaque bascule propre à Meeshy dit ce qu’elle fait', () => {
  test('présence, accusés réciproques, découverte par le carnet, appels hors contacts et retour d’un contact se lisent au repos', async () => {
    const host = await mount(
      <SettingsContent>
        <PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />
      </SettingsContent>,
    );
    const read = atRest(host);
    expect(read).toContain('La pastille verte sur votre avatar indique que vous êtes actif.');
    expect(read).not.toContain('preuve d\'activité');
    expect(read).toContain('Réciproque');
    expect(read).toContain('ne vous retrouveront pas par votre numéro ou votre e-mail');
    expect(read).toContain('seuls vos amis peuvent vous faire sonner');
    expect(read).toContain('« était sur Meeshy récemment », au plus une fois toutes les 3 heures');
  });

  test('les bascules du carnet et du retour portent le mot du lexique, et chaque bascule cite sa phrase', async () => {
    const host = await mount(<PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />);
    const hidden = host.querySelector('[role="switch"][aria-label="Masquer mon numéro et mon e-mail"]');
    const back = host.querySelector('[role="switch"][aria-label="Annoncer mon retour"]');
    expect(hidden).not.toBeNull();
    expect(back).not.toBeNull();
    const described = host.querySelector(`[id="${back?.getAttribute('aria-describedby')}"]`);
    expect(described?.textContent).toContain('était sur Meeshy récemment');
    expect(described?.className ?? '').not.toContain('sr-only');
  });
});

describe('statut en ligne : la première phrase reste, la nuance passe derrière un (i)', () => {
  test('le (i) est nommé par une question et porte « écrire reste une preuve d’activité »', async () => {
    const host = await mount(
      <SettingsContent>
        <PrivacySection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />
      </SettingsContent>,
    );
    const button = infoButton(host, 'Que se passe-t-il si je le désactive ?');
    const note = host.querySelector(`[id="${button.getAttribute('aria-controls')}"]`);
    expect(note?.textContent).toBe('Personne ne voit plus ce point. Mais écrire dans une conversation reste une preuve d\'activité pour vos interlocuteurs.');
    expect(note?.className).toContain('sr-only');
    const toggle = host.querySelector('[role="switch"][aria-label="Statut en ligne"]');
    expect(toggle?.getAttribute('aria-describedby')?.split(' ')).toContain(note?.id ?? '?');
  });
});

describe('apparence : les langues de traduction disent le Prisme', () => {
  test('la rangée porte, au repos, la phrase qui dit ce que la traduction fait', async () => {
    const host = await mount(<AppearanceSection language="fr" theme="system" onTheme={noop} interfaceChoice={null} onInterfaceLanguage={noop} primaryLanguage="fr" />);
    expect(atRest(host.querySelector('[data-settings-content-languages]'))).toContain('Tout le contenu se lit dans votre langue, traduit automatiquement.');
  });
});

describe('notifications et données', () => {
  test('le retour d’un contact garde le mot du lexique et dit, dessous, ce qu’il notifie', async () => {
    const host = await mount(<NotificationsSection language="fr" view={ready} disabled={false} onToggle={noop} onRetry={noop} />);
    const toggle = host.querySelector('[role="switch"][aria-label="Retour d’un contact"]');
    expect(toggle).not.toBeNull();
    expect(atRest(host)).toContain('Une notification quand un contact revient sur Meeshy.');
    expect(host.querySelector(`[id="${toggle?.getAttribute('aria-describedby')}"]`)?.textContent).toBe('Une notification quand un contact revient sur Meeshy.');
  });

  test('la traduction sur l’appareil dit ce qu’elle fait ; le détail (taille, langues) reste derrière son (i)', async () => {
    const host = await mount(
      <SettingsContent>
        <DataSection language="fr" deviceTranslation={{ enabled: false, ready: true, onToggle: noop }} />
      </SettingsContent>,
    );
    expect(atRest(host)).toContain('Les messages sont traduits ici, par un modèle téléchargé une seule fois.');
    expect(atRest(host)).not.toContain('110 Mo');
    const button = infoButton(host, 'Que fait la traduction sur cet appareil ?');
    expect(host.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)?.textContent).toContain('110 Mo');
  });

  test('le bandeau hors ligne se lit en entier, sans geste', async () => {
    const host = await mount(<SettingsOfflineNotice language="fr" />);
    expect(atRest(host)).toContain('vos réglages restent lisibles ; ils se modifieront avec le réseau');
    expect(host.querySelector('button')).toBeNull();
  });
});

describe('qui est prévenu', () => {
  const view = (overrides: Partial<typeof CIRCLE_NOTIFY_DEFAULTS>) => (
    <SettingsContent>
      <CircleNotifySectionView
        language="fr"
        view={{ kind: 'ready', preferences: { ...CIRCLE_NOTIFY_DEFAULTS, ...overrides } }}
        disabled={false}
        onChoose={noop}
        onRetry={noop}
      />
    </SettingsContent>
  );

  test('le bloc garde son titre, sa phrase d’orientation et le nom entier de ses familles', async () => {
    const host = await mount(view({}));
    expect(host.querySelector('h2')?.textContent).toBe('QUI EST PRÉVENU');
    const read = atRest(host);
    expect(read).toContain('Choisissez, action par action, le cercle de votre entourage qui reçoit une notification.');
    expect(read).toContain('L’activité des autres sur mes contenus');
    expect(read).toContain('Mon activité ailleurs');
  });

  test('une famille ouverte dit, sous un cran inhabituel, qui est prévenu', async () => {
    const all = (choice: 'NOBODY' | 'PUBLIC') => Object.fromEntries(Object.keys(CIRCLE_NOTIFY_DEFAULTS).map((key) => [key, choice])) as typeof CIRCLE_NOTIFY_DEFAULTS;
    const nobody = await mount(view(all('NOBODY')));
    await click(nobody.querySelector('[data-circle-family]'));
    expect(atRest(nobody)).toContain('Personne de votre entourage n’est prévenu.');
    expect(nobody.querySelector('[aria-label="Qui est prévenu avec ce choix ?"]')).toBeNull();
    const everyone = await mount(view(all('PUBLIC')));
    await click(everyone.querySelector('[data-circle-family]'));
    expect(atRest(everyone)).toContain('Meeshy n’a pas d’abonnés, aucun inconnu n’est prévenu.');
  });
});

const session = (overrides: Partial<ActiveSession>): ActiveSession =>
  ({
    id: 's',
    deviceType: 'desktop',
    deviceVendor: null,
    deviceModel: null,
    deviceName: null,
    osName: 'macOS',
    osVersion: '15.2',
    browserName: 'Chrome',
    browserVersion: '141',
    isMobile: false,
    appVersion: '2.13.0',
    appBuild: null,
    platform: 'web',
    loginMethod: 'password',
    ipAddress: '203.0.113.7',
    country: 'SN',
    city: 'Dakar',
    location: 'Dakar, SN',
    timezone: 'Africa/Dakar',
    createdAt: '2026-10-01T08:00:00.000Z',
    lastActivityAt: '2026-10-08T11:00:00.000Z',
    isCurrent: false,
    isTrusted: false,
    ...overrides,
  }) as ActiveSession;

const securityScreen = (data: ActiveSessions) => (
  <SettingsSecurityScreen
    language="fr"
    deps={{ load: async () => ({ ok: true, data, status: 200 }), revoke: async () => ({ ok: true, data: {}, status: 200 }), revokeOthers: async () => ({ ok: true, data: 0, status: 200 }) }}
    queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    now={() => new Date('2026-10-08T12:00:00.000Z')}
  />
);

describe('sécurité : les sessions', () => {
  const two: ActiveSessions = {
    sessions: [session({ id: 'autre', deviceName: 'Pixel 7', platform: 'android-shell' }), session({ id: 'ici', isCurrent: true })],
    geolocation: null,
  };

  test('l’écran dit à quoi sert la liste et quoi faire d’une session inconnue', async () => {
    const host = await mount(securityScreen(two));
    await settle();
    expect(atRest(host)).toContain('Les appareils connectés à votre compte. Fermez toute session que vous ne reconnaissez pas.');
  });

  test('chaque session montre, sans ouvrir « Plus », son ouverture, sa dernière activité et son lieu', async () => {
    const host = await mount(securityScreen(two));
    await settle();
    const card = host.querySelector('[data-session="autre"]');
    const read = atRest(card);
    expect(read).toContain('Pixel 7');
    expect(read).toContain('Ouverte le');
    expect(read).toContain('2026');
    expect(read).toContain('Dernière activité');
    expect(read).toContain('il y a 1 heure');
    expect(read).toContain('Dakar');
    expect(read).not.toContain('203.0.113.7');
  });

  test('le bloc du chiffrement dit ce qu’il est avant de mener aux appareils', async () => {
    const host = await mount(securityScreen(two));
    await settle();
    const block = host.querySelector('[data-settings-e2ee-devices-row]')?.closest('section') ?? null;
    expect(atRest(block)).toContain('Il se choisit par conversation et ne se défait pas. Vos appareils chiffrés sont les seuls à lire ces conversations.');
    expect(atRest(block)).toContain('Mes appareils chiffrés');
  });

  test('la session d’ici est marquée « Cet appareil », et l’action d’une autre se nomme en entier', async () => {
    const host = await mount(securityScreen(two));
    await settle();
    expect(atRest(host.querySelector('[data-session="ici"]'))).toContain('Cet appareil');
    expect(atRest(host.querySelector('[data-session="autre"]'))).not.toContain('Cet appareil');
    expect(atRest(host.querySelector('[data-session="autre"]'))).toContain('Fermer cette session');
    expect(atRest(host)).toContain('Déconnecter les autres appareils');
  });

  test('le détail technique reste à un geste : « Plus » donne l’adresse IP', async () => {
    const host = await mount(securityScreen(two));
    await settle();
    const card = host.querySelector<HTMLElement>('[data-session="autre"]');
    await click([...(card?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Plus') ?? null);
    expect(atRest(card)).toContain('203.0.113.7');
  });

  test('sans session : l’état vide dit ce qui apparaîtra', async () => {
    const host = await mount(securityScreen({ sessions: [], geolocation: null }));
    await settle();
    expect(atRest(host)).toContain('Vos appareils connectés apparaîtront ici.');
  });
});

const device = (overrides: Partial<E2eeDevice>): E2eeDevice => ({
  deviceId: 1,
  platform: 'ios',
  label: null,
  enrolledAt: '2026-10-20T09:00:00.000Z',
  lastSeenAt: '2026-10-25T08:00:00.000Z',
  current: false,
  registrationId: 4242,
  ...overrides,
});

const devicesScreen = (devices: readonly E2eeDevice[], host: 'browser' | 'android-shell' = 'browser') => (
  <SettingsE2eeDevicesScreen
    language="fr"
    deps={{ load: async () => ({ ok: true, data: devices, status: 200 }), retire: async () => ({ ok: true, data: { deviceId: 1, retired: true, signedOut: true }, status: 200 }) }}
    queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    host={host}
    now={() => new Date('2026-10-25T12:00:00.000Z')}
  />
);

describe('mes appareils chiffrés', () => {
  const served = [device({ deviceId: 7, label: 'iPhone de Awa' }), device({ deviceId: 8, platform: 'macos', current: true })];

  test('chaque rangée montre, sans geste, son nom, sa plateforme, sa date d’enregistrement et son dernier usage', async () => {
    const host = await mount(devicesScreen(served));
    await settle();
    const read = atRest(host.querySelector('[data-e2ee-device="7"]'));
    expect(read).toContain('iPhone de Awa');
    expect(read).toContain('iPhone ou iPad');
    expect(read).toContain('Chiffrement activé');
    expect(read).toContain('20 oct. 2026');
    expect(read).toContain('Dernière activité');
    expect(read).toContain('il y a 4 heures');
    expect(read).toContain('Retirer cet appareil');
  });

  test('l’appareil courant porte la pastille « Cet appareil », lisible sans geste', async () => {
    const host = await mount(devicesScreen(served));
    await settle();
    expect(atRest(host.querySelector('[data-e2ee-device="8"]'))).toContain('Cet appareil');
    expect(atRest(host.querySelector('[data-e2ee-device="7"]'))).not.toContain('Cet appareil');
  });

  test('le numéro d’appareil reste derrière « Plus »', async () => {
    const host = await mount(devicesScreen(served));
    await settle();
    const card = host.querySelector<HTMLElement>('[data-e2ee-device="7"]');
    expect(card?.querySelector('[data-e2ee-device-field="number"]')).toBeNull();
    await click([...(card?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Plus') ?? null);
    expect(card?.querySelector('[data-e2ee-device-field="number"]')?.textContent).toContain('7');
  });

  test('l’écran dit ce qu’est la liste et ce que fait un retrait ; la façon d’approuver un appareil est derrière un (i)', async () => {
    const host = await mount(devicesScreen(served));
    await settle();
    const read = atRest(host);
    expect(read).toContain('CHIFFREMENT DE BOUT EN BOUT');
    expect(read).toContain('Retirez celui que vous avez perdu ou qu’on vous a volé : il sera déconnecté et ne recevra plus vos messages chiffrés.');
    expect(read).not.toContain('L’approbation entre vos appareils');
    const button = infoButton(host, 'Comment approuver un nouvel appareil ?');
    const note = host.querySelector(`[id="${button.getAttribute('aria-controls')}"]`);
    expect(note?.textContent).toBe('L’approbation entre vos appareils se fait dans l’application Meeshy, en lisant sur l’un le code affiché par l’autre.');
    await click(button);
    expect(atRest(host)).toContain('L’approbation entre vos appareils');
  });

  test('« vous êtes ici » dit en entier pourquoi ce navigateur ne lit pas le chiffré, et où le lire', async () => {
    const browser = await mount(devicesScreen(served));
    await settle();
    expect(atRest(browser.querySelector('[data-e2ee-devices-here]'))).toContain('ouvrez-les dans l’application Meeshy installée');
    const shell = await mount(devicesScreen(served, 'android-shell'));
    await settle();
    expect(atRest(shell.querySelector('[data-e2ee-devices-here]'))).toContain('ouvrez-les sur un de vos appareils chiffrés');
  });

  test('sans appareil : l’état vide dit comment en ajouter un', async () => {
    const host = await mount(devicesScreen([]));
    await settle();
    expect(atRest(host)).toContain('Activez le chiffrement de bout en bout dans l’application Meeshy');
  });
});

describe('les pages de lien du compte', () => {
  const emailDeps = { load: async () => ({ ok: true as const, data: true, status: 200 }), save: async (enabled: boolean) => ({ ok: true as const, data: enabled, status: 200 }) };
  const refused = { verify: async () => ({ ok: false as const, status: 0, error: '' }) };

  test('un lien expiré dit quoi refaire', async () => {
    const host = await mount(
      <VerifyEmailChangePage token="jeton" signedIn language="fr" deps={{ verify: async () => ({ ok: false, status: 400, error: 'expired', code: 'TOKEN_EXPIRED' }) }} />,
    );
    await settle();
    expect(atRest(host)).toContain('Ce lien a expiré. Refaites la demande depuis les réglages.');
  });

  test('un lien sans code dit lequel ouvrir', async () => {
    const host = await mount(<VerifyEmailChangePage token={null} signedIn language="fr" deps={refused} />);
    expect(atRest(host)).toContain('Ouvrez celui de l’e-mail le plus récent.');
  });

  test('un lien d’e-mail ouvert sans session dit qu’il agit sur le compte et comment y revenir', async () => {
    const host = await mount(<VerifyEmailChangePage token="jeton" signedIn={false} language="fr" deps={refused} />);
    expect(atRest(host)).toContain('Ce lien agit sur votre compte. Connectez-vous, puis rouvrez-le depuis l’e-mail.');
  });

  test('couper les e-mails : ceux de sécurité continuent, et c’est écrit', async () => {
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={emailDeps} />);
    await settle();
    expect(atRest(host)).toContain('Les e-mails de sécurité de votre compte continuent d’arriver.');
  });

  test('l’export dit ce que contient le fichier', async () => {
    const host = await mount(<DataExportPage signedIn online language="fr" deps={{ request: async () => ({ ok: false, status: 0, error: '' }), download: async () => 'delivered' }} />);
    expect(atRest(host)).toContain('votre profil, vos messages, vos contacts et vos publications');
  });
});

describe('les packs', () => {
  test('la boutique dit ce qu’installer et retirer change ; le sort des stickers déjà envoyés est derrière un (i)', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, []);
    const host = await mount(
      <QueryClientProvider client={appQueryClient}>
        <PackShop
          adapter={stickerShopAdapter('fr', { source: 'fixture' } as unknown as ConversationsDeps)}
          language="fr"
          hint={translateStickerPacks('fr', 'stickerPacks.shop.hint')}
          hintNote={stickerShopHintNote('fr')}
        />
      </QueryClientProvider>,
    );
    await settle();
    expect(atRest(host.querySelector('[data-shop-hint]'))).toBe('Installez les packs à retrouver dans vos stickers, retirez les autres.');
    expect(atRest(host)).not.toContain('restent lisibles');
    const button = infoButton(host, 'Que deviennent les stickers déjà envoyés ?');
    expect(host.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)?.textContent).toBe('Les stickers déjà envoyés restent lisibles, même après le retrait de leur pack.');
  });

  test('proposer un pack dit ce qui arrive à la proposition', async () => {
    const host = await mount(<PackSubmitEditor language="fr" onClose={noop} onSubmitted={noop} />);
    const consigne = (await import('@/lib/interface-catalogs/catalog-sticker-packs-fr')).default['stickerPacks.submit.hint'];
    expect(atRest(host)).toContain(consigne);
  });
});

describe('sept langues', () => {
  const LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;
  const distinct = (values: readonly (string | undefined)[]): void => {
    expect(values.every((value) => typeof value === 'string' && value.length > 5)).toBe(true);
    expect(new Set(values).size).toBe(7);
  };

  test('les repères et les questions des réglages existent partout, traduits', async () => {
    const main = await Promise.all(LANGUAGES.map(async (language) => (await import(`@/lib/interface-catalogs/catalog-${language}`)).default as Record<string, string>));
    const sessions = await Promise.all(LANGUAGES.map(async (language) => (await import(`@/lib/interface-catalogs/catalog-sessions-${language}`)).default as Record<string, string>));
    const packs = await Promise.all(LANGUAGES.map(async (language) => (await import(`@/lib/interface-catalogs/catalog-sticker-packs-${language}`)).default as Record<string, string>));
    for (const key of ['settings.content_languages.info', 'settings.privacy.online_status.info', 'settings.privacy.online_status.question', 'settings.privacy.online_status.more']) {
      distinct(main.map((catalog) => catalog[key]));
    }
    for (const key of ['e2eeDevices.section.lead', 'e2eeDevices.approval.question']) distinct(sessions.map((catalog) => catalog[key]));
    for (const key of ['stickerPacks.shop.hint', 'stickerPacks.shop.hint.question', 'stickerPacks.shop.hint.more']) distinct(packs.map((catalog) => catalog[key]));
  });

  test('la phrase courte de la traduction sur l’appareil existe partout, et n’est nulle part une copie du français', async () => {
    const values = await Promise.all(
      (['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const).map(
        async (language) => ((await import(`@/lib/interface-catalogs/catalog-device-translation-${language}`)).default as Record<string, string>)['settings.device_translation.summary'],
      ),
    );
    expect(values.every((value) => typeof value === 'string' && value.length > 10)).toBe(true);
    expect(new Set(values).size).toBe(7);
  });
});
