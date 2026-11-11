import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import type { E2eeDevice } from '@/lib/api/e2ee-devices';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { PACK_CATALOGUE_QUERY_KEY, resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import type { ActiveSession, ActiveSessions } from '@/lib/api/account-security';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadLicencesCatalog } from '@/lib/i18n-licences-catalog';
import { loadSessionsCatalog } from '@/lib/i18n-sessions-catalog';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { stickerShopAdapter } from '@/components/composer-sticker-shop';
import { PackShop } from '@/components/pack-shop';
import { PackSubmitEditor } from '@/components/sticker-pack-submit';

import { DataExportPage } from './data-export';
import { EmailNotificationsPage } from './settings-notifications';
import { SettingsE2eeDevicesScreen } from './settings-e2ee-devices';
import { SettingsLicencesScreen } from './settings-licences';
import { SettingsSecurityScreen } from './settings-security';
import { VerifyEmailChangePage } from './verify-email-change';
import { LinkPage, ReachFailurePage } from './link-page-parts';

/**
 * L'ÉPURE DES RÉGLAGES, DEUXIÈME PASSE (#17594, épure #17584) — la rangée d'un
 * pack nomme, la fiche explique ; une session et un appareil chiffré montrent
 * l'essentiel et rangent le reste derrière « Plus » ; les pages de lien tiennent
 * en un titre et une action ; chaque explication retirée de l'écran reste lue
 * derrière un (i) nommé par sa question.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadSessionsCatalog('fr'), loadStickerPacksCatalog('fr'), loadLicencesCatalog('fr')]);
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

const seen = (host: HTMLElement): string => {
  const copy = host.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove();
  return copy.textContent ?? '';
};

const moreButton = (host: ParentNode): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Plus');
  if (button === undefined) throw new Error('aucun « Plus »');
  return button;
};

const descriptionOf = (host: ParentNode, control: Element): string =>
  (control.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => host.querySelector(`[id="${id}"]`)?.textContent ?? '')
    .join(' ');

const fieldKeys = (card: Element | null, attribute: string): readonly (string | null)[] =>
  [...(card?.querySelectorAll(`[${attribute}]`) ?? [])].map((field) => field.getAttribute(attribute));

describe('une session ouverte', () => {
  const session = (): ActiveSession => ({
    id: 'autre',
    isCurrent: false,
    isTrusted: false,
    deviceName: 'Pixel 7',
    deviceVendor: 'Google',
    deviceModel: 'Pixel 7',
    platform: 'android-shell',
    osName: 'Android',
    osVersion: '15',
    browserName: 'Chrome',
    browserVersion: '130',
    appVersion: '2.0.1',
    appBuild: null,
    ipAddress: '203.0.113.7',
    city: 'Dakar',
    country: 'SN',
    location: null,
    timezone: 'Africa/Dakar',
    createdAt: '2026-10-01T08:00:00.000Z',
    lastActivityAt: '2026-10-08T11:00:00.000Z',
    loginMethod: 'password',
  } as ActiveSession);

  const screen = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const data: ActiveSessions = { sessions: [session()], geolocation: null };
    return (
      <SettingsSecurityScreen
        language="fr"
        deps={{ load: async () => ({ ok: true, data, status: 200 }), revoke: async () => ({ ok: true, data: {}, status: 200 }), revokeOthers: async () => ({ ok: true, data: 0, status: 200 }) }}
        queryClient={queryClient}
        now={() => new Date('2026-10-08T12:00:00.000Z')}
      />
    );
  };

  test('au repos : le lieu et la dernière activité seulement', async () => {
    const host = await mount(screen());
    await settle();
    const card = host.querySelector('[data-session="autre"]');
    expect(fieldKeys(card, 'data-session-field')).toEqual(['place', 'lastActive']);
    expect(card?.textContent).not.toContain('Adresse IP');
  });

  test('« Plus » range IP, fuseau, plateforme, système, navigateur, ouverture et méthode — atteignables', async () => {
    const host = await mount(screen());
    await settle();
    const card = host.querySelector<HTMLElement>('[data-session="autre"]');
    const more = moreButton(card as HTMLElement);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const keys = fieldKeys(card, 'data-session-field');
    for (const key of ['app', 'platform', 'system', 'browser', 'ip', 'timezone', 'opened', 'method']) expect(keys).toContain(key);
  });

  test('chaque « Plus » dit, au lecteur d’écran, de quelle session il parle', async () => {
    const host = await mount(screen());
    await settle();
    const more = moreButton(host.querySelector<HTMLElement>('[data-session="autre"]') as HTMLElement);
    expect(descriptionOf(host, more)).toBe('Pixel 7');
  });
});

describe('un appareil chiffré', () => {
  const device: E2eeDevice = {
    deviceId: 7,
    platform: 'ios',
    label: 'iPhone de Awa',
    enrolledAt: '2026-10-20T09:00:00.000Z',
    lastSeenAt: '2026-10-25T08:00:00.000Z',
    current: false,
    registrationId: 4242,
  };

  const screen = () => (
    <SettingsE2eeDevicesScreen
      language="fr"
      deps={{ load: async () => ({ ok: true, data: [device], status: 200 }), retire: async () => ({ ok: true, data: { deviceId: 7, retired: true, signedOut: true }, status: 200 }) }}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      host="browser"
      now={() => new Date('2026-10-25T12:00:00.000Z')}
    />
  );

  test('un seul (i) à icône seule, posé au titre ; les deux questions ne s’affichent plus', async () => {
    const host = await mount(screen());
    await settle();
    expect(seen(host)).not.toContain('À quoi sert cette liste ?');
    expect(seen(host)).not.toContain('Comment approuver un appareil ?');
    const hint = infoButton(host, 'À quoi sert cette liste ?');
    expect(hint.textContent).toBe('');
    expect(noteOf(host, hint).textContent).toContain('Retirez celui que vous avez perdu');
    expect(noteOf(host, hint).textContent).toContain('L’approbation entre vos appareils');
  });

  test('au repos : activation et dernière activité ; « Plus » donne le numéro et la plateforme', async () => {
    const host = await mount(screen());
    await settle();
    const card = host.querySelector<HTMLElement>('[data-e2ee-device="7"]');
    expect(fieldKeys(card, 'data-e2ee-device-field')).toEqual(['enrolled', 'lastSeen']);
    await click(moreButton(card as HTMLElement));
    const keys = fieldKeys(card, 'data-e2ee-device-field');
    expect(keys).toContain('number');
    expect(keys).toContain('platform');
  });

  test('son « Plus » dit, au lecteur d’écran, de quel appareil il parle', async () => {
    const host = await mount(screen());
    await settle();
    const more = moreButton(host.querySelector<HTMLElement>('[data-e2ee-device="7"]') as HTMLElement);
    expect(descriptionOf(host, more)).toBe('iPhone de Awa');
  });
});

describe('Proposer un pack', () => {
  test('la consigne et la zone de texte passent derrière un (i) nommé par leur question', async () => {
    const host = await mount(<PackSubmitEditor language="fr" onClose={() => undefined} onSubmitted={() => undefined} />);
    expect(seen(host)).not.toContain('Ajoutez au moins trois images');
    const how = infoButton(host, 'Comment proposer un pack ?');
    expect(noteOf(host, how).textContent).toContain('Ajoutez au moins trois images');
    expect(noteOf(host, how).textContent).toContain('Chaque pack est relu avant publication');
  });
});

describe('la rangée d’un pack', () => {
  const pack: StickerPackSummary = {
    slug: 'colibri',
    name: 'Colibri',
    description: 'Le colibri de Meeshy : ses humeurs, ses gestes et ses instants, du plus calme au plus déchaîné.',
    author: 'Meeshy',
    builtin: false,
    status: 'approved',
    itemCount: 100,
    kinds: ['static', 'cinematic', 'instant'],
    coverUrl: null,
    installed: false,
    installCount: 0,
  };
  const deps: ConversationsDeps = { source: 'fixture' } as unknown as ConversationsDeps;

  const shop = () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [pack]);
    return (
      <QueryClientProvider client={appQueryClient}>
        <PackShop adapter={stickerShopAdapter('fr', deps)} language="fr" />
      </QueryClientProvider>
    );
  };

  test('au repos : le nom et « 100 stickers » — ni description tronquée, ni auteur, ni genres', async () => {
    const host = await mount(shop());
    await settle();
    const row = host.querySelector<HTMLElement>('[data-shop-pack="colibri"]');
    expect(row?.textContent).toContain('100 stickers');
    expect(row?.textContent).not.toContain('Le colibri de Meeshy');
    expect(row?.textContent).not.toContain('Par Meeshy');
    expect(row?.textContent).not.toContain('Animés');
  });

  test('toucher la rangée ouvre la fiche : description entière, auteur et genres', async () => {
    const host = await mount(shop());
    await settle();
    const open = host.querySelector<HTMLButtonElement>('[data-shop-open="colibri"]');
    expect(open).not.toBeNull();
    await click(open as HTMLButtonElement);
    const sheet = document.querySelector('[data-pack-details="colibri"]');
    expect(sheet?.textContent).toContain('Le colibri de Meeshy : ses humeurs, ses gestes et ses instants, du plus calme au plus déchaîné.');
    expect(sheet?.textContent).toContain('Par Meeshy');
    expect(sheet?.textContent).toContain('Animés');
  });
});

describe('les pages de lien', () => {
  const pageDeps = { load: async () => ({ ok: true as const, data: true, status: 200 }), save: async (enabled: boolean) => ({ ok: true as const, data: enabled, status: 200 }) };

  test('sans session : un titre et « Se connecter », aucune consigne', async () => {
    const host = await mount(<DataExportPage signedIn={false} online language="fr" deps={{ request: async () => ({ ok: false, status: 0, error: '' }), download: async () => 'delivered' }} />);
    expect(host.textContent).toContain('Connectez-vous pour continuer');
    expect(host.textContent).not.toContain('Ce lien agit sur votre compte');
    expect(host.textContent).not.toContain('rouvrez-le');
  });

  test('hors ligne et service indisponible : le titre et « Réessayer », sans phrase', async () => {
    const offline = await mount(<ReachFailurePage language="fr" failure="offline" onRetry={() => undefined} />);
    expect(offline.textContent).toContain('Hors ligne');
    expect(offline.textContent).not.toContain('Reconnectez-vous');
    const unavailable = await mount(<ReachFailurePage language="fr" failure="unavailable" onRetry={() => undefined} />);
    expect(unavailable.textContent).toContain('Meeshy ne répond pas');
    expect(unavailable.textContent).not.toContain('momentanément indisponible');
  });

  test('l’export : (i) « Que contient l’export ? », action « Exporter », une seule action secondaire « Réglages »', async () => {
    const host = await mount(<DataExportPage signedIn online language="fr" deps={{ request: async () => ({ ok: false, status: 0, error: '' }), download: async () => 'delivered' }} />);
    expect(seen(host)).not.toContain('RGPD');
    const hint = infoButton(host, 'Que contient l’export ?');
    expect(noteOf(host, hint).textContent).toContain('RGPD');
    const labels = [...host.querySelectorAll('button, a')].map((control) => control.textContent).filter((label) => label !== '');
    expect(labels).toContain('Exporter');
    expect(labels).toContain('Réglages');
    expect(labels).not.toContain('Retour à Meeshy');
  });

  test('les e-mails de Meeshy : « Désactiver » puis « Réactiver », la phrase d’état reste', async () => {
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={pageDeps} />);
    await settle();
    expect(host.textContent).toContain('Vous recevez les e-mails de Meeshy.');
    const toggle = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Désactiver');
    expect(toggle).toBeDefined();
    await click(toggle as HTMLButtonElement);
    await settle();
    expect([...host.querySelectorAll('button')].some((button) => button.textContent === 'Réactiver')).toBe(true);
  });

  test('un lien sans code : « Lien incomplet. », « Réglages », et la consigne derrière « Que faire ? »', async () => {
    const host = await mount(<VerifyEmailChangePage token={null} signedIn language="fr" deps={{ verify: async () => ({ ok: false, status: 0, error: '' }) }} />);
    expect(seen(host)).toContain('Lien incomplet.');
    expect(seen(host)).not.toContain('Ouvrez celui de l’e-mail');
    const hint = infoButton(host, 'Que faire ?');
    expect(noteOf(host, hint).textContent).toContain('Ouvrez celui de l’e-mail le plus récent');
    const actions = [...host.querySelectorAll('a')].map((link) => link.textContent);
    expect(actions).toEqual(['Réglages']);
  });

  test('un lien expiré : « Lien expiré » et l’action « Réglages »', async () => {
    const host = await mount(
      <VerifyEmailChangePage
        token="jeton"
        signedIn
        language="fr"
        deps={{ verify: async () => ({ ok: false, status: 400, error: 'expired', code: 'TOKEN_EXPIRED' }) }}
      />,
    );
    await settle();
    expect(seen(host)).toContain('Lien expiré');
    expect(seen(host)).not.toContain('Refaites la demande');
    const hint = infoButton(host, 'Comment obtenir un nouveau lien ?');
    expect(noteOf(host, hint).textContent).toBe('Refaites la demande depuis les réglages.');
    expect([...host.querySelectorAll('a')].map((link) => link.textContent)).toContain('Réglages');
  });

  test('un lien de confirmation ouvert sans session : la consigne « rouvrez-le depuis l’e-mail » reste derrière son (i)', async () => {
    const host = await mount(<VerifyEmailChangePage token="jeton" signedIn={false} language="fr" deps={{ verify: async () => ({ ok: false, status: 0, error: '' }) }} />);
    expect(seen(host)).toContain('Connectez-vous pour continuer');
    expect(seen(host)).not.toContain('rouvrez-le');
    const hint = infoButton(host, 'Que faire après la connexion ?');
    expect(noteOf(host, hint).textContent).toContain('rouvrez-le depuis l’e-mail');
  });

  test('un lien de désabonnement ouvert sans session : même consigne derrière le même (i)', async () => {
    const host = await mount(<EmailNotificationsPage signedIn={false} language="fr" deps={pageDeps} />);
    expect(noteOf(host, infoButton(host, 'Que faire après la connexion ?')).textContent).toContain('rouvrez-le depuis l’e-mail');
  });

  test('une page de lien ne pose plus de LinkPage vide à elle seule', async () => {
    const host = await mount(<LinkPage glyph="lock" tone="brand" title="Titre" />);
    expect(host.textContent).toBe('Titre');
  });
});

describe('Licences open source', () => {
  const engine = { version: '0.105.4', acknowledgmentsUrl: 'https://github.com/signalapp/libsignal/tree/v0.105.4/acknowledgments' } as never;

  test('« Ouvrir » nomme les deux liens ; la phrase de l’avis passe derrière « Que couvre cet avis ? »', async () => {
    const host = await mount(<SettingsLicencesScreen language="fr" commit={null} engine={engine} />);
    expect(host.querySelector('[data-licences-source]')?.getAttribute('aria-description')).toBe('Ouvrir');
    expect(host.querySelector('[data-licences-libsignal]')?.textContent).toContain('Ouvrir');
    expect(host.querySelector('[data-licences-libsignal]')?.textContent).not.toContain('Voir les avis publiés');
    expect(seen(host)).not.toContain('et les bibliothèques qu’il intègre');
    const hint = infoButton(host, 'Que couvre cet avis ?');
    expect(noteOf(host, hint).textContent).toContain('libsignal et les bibliothèques qu’il intègre');
    expect(host.textContent).toContain('est disponible gratuitement');
    expect(host.textContent).toContain('validation juridique');
  });
});

describe('sept langues, aucune copie du français', () => {
  const shortLabels = [
    ['stickerPacks.submit.open', 'Proposer'],
    ['dataExport.action.start', 'Exporter'],
    ['emailNotifications.unsubscribe', 'Désactiver'],
    ['emailNotifications.resubscribe', 'Réactiver'],
    ['linkPage.settings', 'Réglages'],
    ['licences.source.open', 'Ouvrir'],
  ] as const;

  test('les libellés raccourcis sont traduits, et les clés devenues sans lecteur n’existent plus', async () => {
    const catalogs = await Promise.all(
      (['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const).map(async (language) => ({
        language,
        entries: {
          ...(await import(`@/lib/interface-catalogs/catalog-${language}`)).default,
          ...(await import(`@/lib/interface-catalogs/catalog-sticker-packs-${language}`)).default,
          ...(await import(`@/lib/interface-catalogs/catalog-licences-${language}`)).default,
        } as Record<string, string>,
      })),
    );
    const problems: string[] = [];
    for (const [key, french] of shortLabels) {
      if (catalogs[0]?.entries[key] !== french) problems.push(`fr ${key}`);
      for (const { language, entries } of catalogs.slice(1)) {
        const value = entries[key];
        if (value === undefined || value === french || value.split(' ').length > 2) problems.push(`${language} ${key}`);
      }
    }
    for (const { language, entries } of catalogs) {
      for (const dead of ['linkPage.signedOut.body', 'linkPage.offline.body', 'linkPage.unavailable.body', 'dataExport.action.again']) {
        if (entries[dead] !== undefined) problems.push(`${language} ${dead}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
