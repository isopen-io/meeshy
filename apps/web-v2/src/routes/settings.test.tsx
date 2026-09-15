import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { AppPreferences } from '@/lib/api/app-preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';

import {
  AboutSection,
  AccountSection,
  AppearanceSection,
  LogoutButton,
  NotificationsSection,
  PrivacySection,
  ProfileCard,
  SETTINGS_HEADER_HEIGHT,
  SETTINGS_TOP_RESERVE,
  SettingsHeaderBar,
  ToolsSection,
  type PreferencesView,
} from './settings-sections';

/**
 * LES RÉGLAGES DESSINÉS (#5563) — miroir `SettingsView.swift`, section pour
 * section. Chaque section est un composant PUR (primitives en props) : ces
 * témoins la rendent sans TanStack Query ni routeur, puis l'interrogent comme
 * un lecteur d'écran le ferait — par rôle et par nom. Ils prouvent ce qu'aucune
 * capture ne dit : où une rangée MÈNE, dans quel ÉTAT une bascule s'ANNONCE, et
 * qu'aucun contrôle n'est offert quand il ne peut rien faire.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const noop = () => undefined;

const preferencesOf = (overrides: Partial<AppPreferences> = {}): AppPreferences => ({
  theme: 'auto',
  pushEnabled: true,
  soundEnabled: true,
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  ...overrides,
});

const ready = (overrides: Partial<AppPreferences> = {}): PreferencesView => ({ kind: 'ready', preferences: preferencesOf(overrides) });

const dom = (element: ReactElement): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
};

const switchNamed = (host: HTMLElement, name: string) => host.querySelector(`[role="switch"][aria-label="${name}"]`);

const linkTo = (host: HTMLElement, href: string) => host.querySelector(`a[href="${href}"]`);

describe('le couloir des disques flottants', () => {
  /* Les deux disques se posent entre 126 et 178 px du haut (`floating-corridor.ts`).
     Au repos, la carte de profil — un contrôle — commence sous ce couloir,
     comme la première rangée de la cloche et le plateau du Flux. */
  test('le contenu réserve la hauteur du couloir sous l’en-tête', () => {
    expect(SETTINGS_HEADER_HEIGHT + SETTINGS_TOP_RESERVE).toBe(FLOATING_CORRIDOR_BOTTOM);
  });
});

describe('l’en-tête', () => {
  test('un retour NOMMÉ vers les conversations, et le titre', () => {
    const host = dom(<SettingsHeaderBar language="fr" />);
    expect(host.querySelector('a[aria-label="Revenir aux conversations"]')?.getAttribute('href')).toBe('/');
    expect(host.querySelector('h1')?.textContent).toBe('Réglages');
  });

  test('se dit dans la langue d’interface', async () => {
    await loadInterfaceCatalog('en');
    expect(dom(<SettingsHeaderBar language="en" />).querySelector('h1')?.textContent).toBe('Settings');
  });
});

describe('la carte de profil', () => {
  test('mène au profil, et montre le nom et l’identifiant', () => {
    const host = dom(<ProfileCard language="fr" user={{ username: 'awa', displayName: 'Awa Diallo', avatar: null }} />);
    const link = linkTo(host, '/me');
    expect(link?.getAttribute('aria-label')).toBe('Mon profil');
    expect(link?.textContent).toContain('Awa Diallo');
    expect(link?.textContent).toContain('@awa');
  });

  test('sans session lue, elle mène quand même au profil', () => {
    expect(linkTo(dom(<ProfileCard language="fr" user={null} />), '/me')?.textContent).toContain('Mon profil');
  });
});

describe('le compte — seule la suppression reste offerte', () => {
  /* #6715 : la page de suppression est portée dans la v2, à l'adresse que les
     e-mails visent. La rangée y mène dans le MÊME onglet, sans légende « version
     classique » — et, son adresse étant relative, chaque environnement ouvre SA
     page : un testeur de staging n'atterrit plus sur la production (#6354). */
  test('la suppression du compte ouvre sa page de la v2, dans le même onglet', () => {
    const host = dom(<AccountSection language="fr" />);
    const link = linkTo(host, '/account/deletion');
    expect(link).not.toBeNull();
    expect(link?.hasAttribute('target')).toBe(false);
    expect(link?.textContent).toContain('Supprimer le compte');
    expect(host.textContent).not.toContain('Version classique');
    expect(host.textContent).not.toContain('Indisponible sur cet environnement');
  });

  /* Le legacy est décommissionné (#6702) : la sécurité, que la v2 ne porte pas
     encore, n'a plus aucune adresse où mener. Elle est MASQUÉE — ni lien, ni
     rangée inerte (loi 4). */
  test('la sécurité, non portée, n’est pas offerte', () => {
    const host = dom(<AccountSection language="fr" />);
    expect(host.textContent).not.toContain('Sécurité');
    expect(host.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('la confidentialité — quatre bascules que la passerelle obéit', () => {
  const NAMES = ['Statut en ligne', 'Dernière connexion', 'Accusés de lecture', 'Indicateur de frappe'];

  test('chaque bascule annonce son état réel', () => {
    const host = dom(
      <PrivacySection
        language="fr"
        view={ready({ showOnlineStatus: false, showTypingIndicator: false })}
        disabled={false}
        onToggle={noop}
        onRetry={noop}
      />,
    );
    expect(NAMES.map((name) => switchNamed(host, name)?.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true', 'false']);
  });

  test('ce qu’une bascule COÛTE se lit sous elle — la réciprocité des accusés de lecture', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.textContent).toContain('vous ne verrez pas non plus si vos messages ont été lus');
  });

  test('hors ligne, aucune bascule n’est actionnable', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled onToggle={noop} onRetry={noop} />);
    expect(NAMES.every((name) => switchNamed(host, name)?.hasAttribute('disabled'))).toBe(true);
  });

  test('sans cache : un squelette nommé, jamais une bascule inventée', () => {
    const host = dom(<PrivacySection language="fr" view={{ kind: 'loading' }} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect(host.querySelector('[aria-busy="true"]')?.textContent).toContain('Chargement des réglages');
  });

  test('en échec : une reprise, jamais une bascule inventée', () => {
    const host = dom(<PrivacySection language="fr" view={{ kind: 'error' }} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toContain('Réessayer');
  });

  /* Le legacy est décommissionné (#6702) : les options fines de
     confidentialité n'ont plus d'adresse où mener. MASQUÉES — ni lien, ni
     rangée inerte (loi 4). */
  test('les options fines, non portées, ne sont pas offertes', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(host.textContent).not.toContain("Plus d'options");
  });
});

describe('l’apparence', () => {
  const appearance = (props: Partial<Parameters<typeof AppearanceSection>[0]> = {}) =>
    dom(
      <AppearanceSection
        language="fr"
        theme="system"
        onTheme={noop}
        interfaceChoice={null}
        onInterfaceLanguage={noop}
        primaryLanguage="fr"
        {...props}
      />,
    );

  test('le thème : trois choix, un seul pressé', () => {
    const host = appearance({ theme: 'dark' });
    const pressed = [...host.querySelectorAll('button[aria-pressed]')].map((button) => [button.textContent, button.getAttribute('aria-pressed')]);
    expect(pressed).toEqual([
      ['Auto', 'false'],
      ['Clair', 'false'],
      ['Sombre', 'true'],
    ]);
  });

  test('« Auto » est pressé quand l’appareil suit le système', () => {
    const host = appearance({ theme: 'system' });
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Auto');
  });

  test('la langue de l’interface : « Automatique » puis les sept langues, chacune dans SA langue', () => {
    const select = appearance().querySelector('select');
    expect(select?.getAttribute('aria-label')).toBe("Langue de l'interface");
    expect([...(select?.querySelectorAll('option') ?? [])].map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Automatique'],
      ['fr', 'Français'],
      ['en', 'English'],
      ['es', 'Español'],
      ['pt', 'Português'],
      ['de', 'Deutsch'],
      ['it', 'Italiano'],
      ['ar', 'العربية'],
    ]);
  });

  /* Lu sur l'attribut `selected` que le navigateur reçoit : happy-dom ne relit
     pas `select.value` depuis un balisage injecté. La sélection VIVANTE est
     mesurée dans un vrai navigateur (`scripts/check-settings.mjs`). */
  test('le choix explicite est celui qui est sélectionné', () => {
    const selectedOf = (host: HTMLElement) => [...host.querySelectorAll('option[selected]')].map((option) => option.getAttribute('value'));
    expect(selectedOf(appearance({ interfaceChoice: 'de' }))).toEqual(['de']);
    expect(selectedOf(appearance({ interfaceChoice: null }))).toEqual(['']);
  });

  test('les langues de traduction vivent dans le profil — une seule source, un seul écran', () => {
    const link = linkTo(appearance({ primaryLanguage: 'es' }), '/me');
    expect(link?.textContent).toContain('Langues de traduction');
    expect(link?.textContent).toContain('Español');
  });
});

describe('les notifications', () => {
  test('les notifications poussées et leur son, dans leur état réel', () => {
    const host = dom(<NotificationsSection language="fr" view={ready({ soundEnabled: false })} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(switchNamed(host, 'Notifications')?.getAttribute('aria-checked')).toBe('true');
    expect(switchNamed(host, 'Sons')?.getAttribute('aria-checked')).toBe('false');
  });

  /* Le legacy est décommissionné (#6702) : les options fines de notification
     n'ont plus d'adresse où mener. MASQUÉES — ni lien, ni rangée inerte. */
  test('les options fines, non portées, ne sont pas offertes', () => {
    const host = dom(<NotificationsSection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} />);
    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(host.textContent).not.toContain("Plus d'options");
  });
});

/**
 * AUCUN CONTRÔLE DES RÉGLAGES NE VISE UNE AUTRE ORIGINE (#6702, #6715) — le
 * legacy est décommissionné, la v2 sert tout le domaine. Médias, messages et
 * export n'ont plus d'adresse : la section « Données » disparaît entière, faute
 * de rangée. La suppression de compte, dernière exception, mène désormais à sa
 * page de la v2.
 */
describe('les réglages ne mènent plus au legacy', () => {
  const everySection = () =>
    dom(
      <>
        <ProfileCard language="fr" user={{ username: 'awa', displayName: 'Awa Diallo', avatar: null }} />
        <AccountSection language="fr" />
        <PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} />
        <AppearanceSection language="fr" theme="system" onTheme={noop} interfaceChoice={null} onInterfaceLanguage={noop} primaryLanguage="fr" />
        <NotificationsSection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} />
        <ToolsSection language="fr" showAdmin />
        <AboutSection language="fr" version="2.0.2" />
      </>,
    );

  test('aucun lien ne vise une autre origine, ni n’ouvre un nouvel onglet — la suppression de compte comprise', () => {
    const host = everySection();
    const hrefs = [...host.querySelectorAll('a[href]')].map((link) => link.getAttribute('href') ?? '');

    expect(hrefs.filter((href) => /^(?:[a-z]+:)?\/\//i.test(href))).toEqual([]);
    expect(host.querySelectorAll('a[target]')).toHaveLength(0);
    expect(hrefs).toContain('/account/deletion');
  });

  test('aucune rangée masquée n’est rendue, même inerte', () => {
    const text = everySection().textContent ?? '';
    for (const label of ['Sécurité', "Plus d'options", 'Médias', 'Messages', 'Exporter mes données']) {
      expect({ label, present: text.includes(label) }).toEqual({ label, present: false });
    }
  });
});

describe('les outils', () => {
  test('la progression mène à son écran', () => {
    expect(linkTo(dom(<ToolsSection language="fr" />), '/me/progression')?.textContent).toContain('Progression');
  });
});

describe('à propos', () => {
  test('conditions, politique de confidentialité et version', () => {
    const host = dom(<AboutSection language="fr" version="2.0.2" />);
    expect(linkTo(host, '/terms')?.textContent).toContain("Conditions d'utilisation");
    expect(linkTo(host, '/privacy')?.textContent).toContain('Politique de confidentialité');
    expect(host.textContent).toContain('2.0.2');
  });
});

describe('la déconnexion', () => {
  test('un bouton nommé, actionnable au repos', () => {
    const button = dom(<LogoutButton language="fr" busy={false} onPress={noop} />).querySelector('button');
    expect(button?.textContent).toContain('Déconnexion');
    expect(button?.hasAttribute('disabled')).toBe(false);
  });

  test('pendant la déconnexion : désactivé, et il dit ce qui se passe', () => {
    const button = dom(<LogoutButton language="fr" busy onPress={noop} />).querySelector('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(button?.textContent).toContain('Déconnexion en cours...');
  });
});
