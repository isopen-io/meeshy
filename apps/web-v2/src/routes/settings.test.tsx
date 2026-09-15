import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { AppPreferences } from '@/lib/api/app-preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { legacyHref, legacyReachable } from '@/lib/view/legacy-link';

import {
  AboutSection,
  AccountSection,
  AppearanceSection,
  DataSection,
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

describe('le compte — ce que la v2.0 ne porte pas reste atteignable', () => {
  test('Sécurité et suppression du compte ouvrent le legacy, dans un nouvel onglet, et le disent', () => {
    const host = dom(<AccountSection language="fr" legacyReachable />);
    for (const destination of ['security', 'accountDeletion'] as const) {
      const link = linkTo(host, legacyHref(destination));
      expect(link).not.toBeNull();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.textContent).toContain('Version classique, nouvel onglet');
    }
    expect(host.textContent).toContain('Sécurité');
    expect(host.textContent).toContain('Supprimer le compte');
  });

  /* #6354 (D-67) : hors production, aucune rangée ne mène à la production
     réelle — un testeur de staging ne doit jamais atterrir sur SA suppression
     de compte, sous un compte qui n'est pas le sien. */
  test('hors production : ni lien ni href vers le legacy — une rangée inerte qui le dit', () => {
    const host = dom(<AccountSection language="fr" legacyReachable={false} />);
    for (const destination of ['security', 'accountDeletion'] as const) {
      expect(linkTo(host, legacyHref(destination))).toBeNull();
    }
    expect(host.querySelectorAll('a[data-legacy]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-legacy-unavailable]')).toHaveLength(2);
    expect(host.textContent).toContain('Sécurité');
    expect(host.textContent).toContain('Supprimer le compte');
    expect(host.textContent).toContain('Indisponible sur cet environnement');
  });

  test('legacyReachable reflète exactement `apiConfig.base` (#6354)', () => {
    expect(legacyReachable('https://gate.meeshy.me')).toBe(true);
    expect(legacyReachable('https://gate.staging.meeshy.me')).toBe(false);
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
        legacyReachable
      />,
    );
    expect(NAMES.map((name) => switchNamed(host, name)?.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true', 'false']);
  });

  test('ce qu’une bascule COÛTE se lit sous elle — la réciprocité des accusés de lecture', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />);
    expect(host.textContent).toContain('vous ne verrez pas non plus si vos messages ont été lus');
  });

  test('hors ligne, aucune bascule n’est actionnable', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled onToggle={noop} onRetry={noop} legacyReachable />);
    expect(NAMES.every((name) => switchNamed(host, name)?.hasAttribute('disabled'))).toBe(true);
  });

  test('sans cache : un squelette nommé, jamais une bascule inventée', () => {
    const host = dom(<PrivacySection language="fr" view={{ kind: 'loading' }} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />);
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect(host.querySelector('[aria-busy="true"]')?.textContent).toContain('Chargement des réglages');
  });

  test('en échec : une reprise, jamais une bascule inventée', () => {
    const host = dom(<PrivacySection language="fr" view={{ kind: 'error' }} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />);
    expect(host.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toContain('Réessayer');
  });

  test('les autres options de confidentialité restent au legacy', () => {
    expect(
      linkTo(dom(<PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />), legacyHref('privacy')),
    ).not.toBeNull();
  });

  test('hors production : la rangée « plus d’options » devient inerte (#6354)', () => {
    const host = dom(<PrivacySection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} legacyReachable={false} />);
    expect(linkTo(host, legacyHref('privacy'))).toBeNull();
    expect(host.querySelector('[data-legacy-unavailable="privacy"]')).not.toBeNull();
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
    const host = dom(<NotificationsSection language="fr" view={ready({ soundEnabled: false })} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />);
    expect(switchNamed(host, 'Notifications')?.getAttribute('aria-checked')).toBe('true');
    expect(switchNamed(host, 'Sons')?.getAttribute('aria-checked')).toBe('false');
  });

  test('les options fines restent au legacy', () => {
    const host = dom(<NotificationsSection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} legacyReachable />);
    expect(linkTo(host, legacyHref('notification'))?.textContent).toContain("Plus d'options");
  });

  test('hors production : la rangée « plus d’options » devient inerte (#6354)', () => {
    const host = dom(<NotificationsSection language="fr" view={ready()} disabled={false} onToggle={noop} onRetry={noop} legacyReachable={false} />);
    expect(linkTo(host, legacyHref('notification'))).toBeNull();
    expect(host.querySelector('[data-legacy-unavailable="notification"]')).not.toBeNull();
  });
});

describe('les données', () => {
  test('médias, messages et export mènent au legacy', () => {
    const host = dom(<DataSection language="fr" legacyReachable />);
    expect(linkTo(host, legacyHref('media'))?.textContent).toContain('Médias');
    expect(linkTo(host, legacyHref('message'))?.textContent).toContain('Messages');
    expect(host.textContent).toContain('Exporter mes données');
  });

  test('hors production : aucune des trois rangées ne mène au legacy (#6354)', () => {
    const host = dom(<DataSection language="fr" legacyReachable={false} />);
    expect(host.querySelectorAll('a[data-legacy]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-legacy-unavailable]')).toHaveLength(3);
    expect(host.textContent).toContain('Médias');
    expect(host.textContent).toContain('Messages');
    expect(host.textContent).toContain('Exporter mes données');
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
