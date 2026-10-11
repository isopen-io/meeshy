import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
import { worldEntrySchema } from '@meeshy/shared/types/world';
import { formatMemberCount } from '@meeshy/shared/utils/member-visibility';

import { SESSION_STORAGE_KEY } from '@/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '@/lib/inline-interface-language-bootstrap.js';
import { ANONYMOUS_MODE } from '@/lib/links/invitation-view';
import { href } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { LandingBootConfig } from './landing-boot';
import { LANDING_COPY } from './landing-copy';
import { minifyInlineScript } from '../../scripts/lib/minify-inline-script';
import { landingBootScript, landingDocument, landingOgImagePath } from './landing-document';
import { LANDING_LANGUAGES, landingPath, landingPaths, type LandingLanguage } from './landing-languages';
import { WORLD_ENTRY_HANDOFF_KEY, WORLD_GUEST_ENTRY_TEMPLATE, WORLD_GUEST_THREAD_TEMPLATE } from './world-entry';

/**
 * LA LANDING PRÉRENDUE (#10002) — le gate des balises, langue par langue, et le
 * comportement du script inliné, rejoué par son TEXTE dans un document réel.
 */
const ORIGIN = 'https://meeshy.example';
const SESSION_KEY = SESSION_STORAGE_KEY;

const documentFor = (language: LandingLanguage): string =>
  landingDocument({
    language,
    origin: ORIGIN,
    sheet: '.ld{}',
    schemeScript: '/*scheme*/',
    themeColors: { dark: 'dark-ink', light: 'light-ink' },
    boot: {
      apiBase: 'https://gate.example',
      worldPath: worldEndpoints.root,
      sessionKey: SESSION_KEY,
      languageKey: INTERFACE_LANGUAGE_KEY,
      entryTemplate: WORLD_GUEST_ENTRY_TEMPLATE,
      threadTemplate: WORLD_GUEST_THREAD_TEMPLATE,
      appPath: href('list'),
    },
  });

const head = (html: string): string => /<head>([\s\S]*)<\/head>/.exec(html)?.[1] ?? '';
const metaContent = (html: string, attribute: 'name' | 'property', key: string): string | null =>
  new RegExp(`<meta ${attribute}="${key}" content="([^"]*)">`).exec(html)?.[1] ?? null;

describe('le document prérendu, par langue (#10002)', () => {
  for (const language of LANDING_LANGUAGES) {
    describe(language, () => {
      const html = documentFor(language);
      const copy = LANDING_COPY[language];
      const url = `${ORIGIN}${landingPath(language)}`;

      test('title, description ≤ 155 et canonical', () => {
        expect(head(html)).toContain('<title>');
        const description = metaContent(html, 'name', 'description');
        expect(description).not.toBe(null);
        expect([...copy.metaDescription].length).toBeLessThanOrEqual(155);
        expect(html).toContain(`<link rel="canonical" href="${url}">`);
      });

      test('hreflang pour les sept langues, et x-default sur la racine', () => {
        for (const code of LANDING_LANGUAGES) {
          expect(html).toContain(`<link rel="alternate" hreflang="${code}" href="${ORIGIN}${landingPath(code)}">`);
        }
        expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`);
      });

      test('Open Graph complet, image 1200 × 630 absolue, et carte Twitter large', () => {
        for (const key of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image:alt', 'og:locale']) {
          expect(metaContent(html, 'property', key)).toBeTruthy();
        }
        expect(metaContent(html, 'property', 'og:url')).toBe(url);
        expect(metaContent(html, 'property', 'og:image')).toBe(`${ORIGIN}${landingOgImagePath(language)}`);
        expect(metaContent(html, 'property', 'og:image:width')).toBe('1200');
        expect(metaContent(html, 'property', 'og:image:height')).toBe('630');
        expect(html.match(/property="og:locale:alternate"/g)?.length).toBe(LANDING_LANGUAGES.length - 1);
        expect(metaContent(html, 'name', 'twitter:card')).toBe('summary_large_image');
      });

      test('JSON-LD Organization + WebApplication, lisible', () => {
        const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
        const graph: unknown = Reflect.get(JSON.parse(raw), '@graph');
        const types = Array.isArray(graph) ? graph.map((node: unknown) => Reflect.get(node as object, '@type')) : [];
        expect(types).toEqual(['Organization', 'WebApplication']);
      });

      test('langue et sens du document, aucun script ni feuille externe', () => {
        expect(html).toContain(`<html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"`);
        expect(html).not.toMatch(/<script[^>]+src=/);
        expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
      });

      test('le corps porte la planche « Main » : héros, nom, connexion, pied légal', () => {
        const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
        expect(body).toContain(copy.headline);
        expect(body).toContain('data-world-form');
        expect(body).toContain('name="name"');
        for (const path of ['/login', '/chats', '/signup', '/help', '/faq', '/privacy', '/terms']) {
          expect(body).toContain(`href="${path}"`);
        }
        expect(body).toContain('src="/brand/logo.png"');
      });

      test('l’étape de la langue est dans la page : sept langues dans leur écriture, retour, erreur dite (#10003, #10067)', () => {
        const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
        for (const code of LANDING_LANGUAGES) expect(body).toMatch(new RegExp(`<input type="radio" name="language"[^>]*value="${code}"`));
        expect(body).toContain('data-world-back');
        expect(body).toMatch(/role="alert"[^>]*data-world-error|data-world-error[^>]*role="alert"/);
        expect(body).toContain(copy.entryFailed.replace(/'/g, '&#x27;'));
        expect(body).toContain('data-world-return');
      });
    });
  }
});

describe('le point d’accroche de l’entrée invité (#10003)', () => {
  test('vise la jonction par lien que la table des routes sert, en mode invité, nom ET langue', () => {
    expect(WORLD_GUEST_ENTRY_TEMPLATE.replace('{link}', 'L').replace('{name}', 'N').replace('{language}', 'ar')).toBe(
      href('chatJoin', { link: 'L' }, { mode: ANONYMOUS_MODE, name: 'N', language: 'ar' }),
    );
  });

  test('le retour d’un invité vise le fil que la table des routes sert', () => {
    expect(WORLD_GUEST_THREAD_TEMPLATE.replace('{conversation}', 'C')).toBe(href('thread', { conversation: 'C' }));
  });
});

type Trace = {
  readonly assigned: string[];
  readonly replaced: string[];
  readonly pushed: unknown[];
  /** Le jeton de passage tel qu'il était posé à l'instant de CHAQUE navigation (#10094). */
  readonly handoffAtAssign: Array<string | null>;
  fetches: number;
};

type Answer = { readonly status: number; readonly body: unknown } | 'network';

type Harness = { readonly win: Window & typeof globalThis; readonly trace: Trace; readonly settle: () => Promise<void> };

const harness = (input: {
  readonly language: LandingLanguage;
  readonly stored?: Readonly<Record<string, string>>;
  readonly response?: { readonly status: number; readonly body: unknown };
  /** Les réponses successives de GET /world — la dernière se répète. */
  readonly responses?: readonly Answer[];
  readonly installed?: 'display-mode' | 'ios-standalone';
  readonly deviceLanguages?: readonly string[];
  /** Le script tel que le prérendu l'inline — minifié (`minifyInlineScript`). */
  readonly script?: (config: LandingBootConfig) => string;
  /** `sessionStorage` refusé (navigation privée, quota) — chaque accès lève. */
  readonly sessionRefused?: boolean;
}): Harness => {
  const html = documentFor(input.language);
  document.documentElement.removeAttribute('data-session');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  const stored = new Map(Object.entries(input.stored ?? {}));
  const trace: Trace = { assigned: [], replaced: [], pushed: [], handoffAtAssign: [], fetches: 0 };
  const tab = new Map<string, string>();
  const refused = (): never => {
    throw new DOMException('refusé', 'SecurityError');
  };
  const answers: readonly Answer[] = input.responses ?? [input.response ?? { status: 200, body: { success: true, data: world() } }];
  let pending: Promise<unknown> = Promise.resolve();
  let historyState: unknown = null;
  const fake = {
    document,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLFormElement: window.HTMLFormElement,
    HTMLInputElement: window.HTMLInputElement,
    matchMedia: (query: string) => ({ matches: input.installed === 'display-mode' && query === '(display-mode: standalone)' }),
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    navigator: {
      ...(input.installed === 'ios-standalone' ? { standalone: true } : {}),
      ...(input.deviceLanguages === undefined ? {} : { languages: input.deviceLanguages }),
    },
    history: {
      get state() {
        return historyState;
      },
      pushState: (state: unknown) => {
        historyState = state;
        trace.pushed.push(state);
      },
      back: () => {
        historyState = null;
        window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
      },
    },
    addEventListener: (type: string, listener: EventListener) => window.addEventListener(type, listener),
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
    sessionStorage: {
      getItem: (key: string) => (input.sessionRefused === true ? refused() : (tab.get(key) ?? null)),
      setItem: (key: string, value: string) => (input.sessionRefused === true ? refused() : void tab.set(key, value)),
    },
    location: {
      search: '',
      hash: '',
      assign: (to: string) => {
        trace.handoffAtAssign.push(tab.get(WORLD_ENTRY_HANDOFF_KEY) ?? null);
        trace.assigned.push(to);
      },
      replace: (to: string) => void trace.replaced.push(to),
    },
    fetch: () => {
      const response = answers[Math.min(trace.fetches, answers.length - 1)] ?? 'network';
      trace.fetches += 1;
      const answer =
        response === 'network'
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve({
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              json: () => Promise.resolve(response.body),
            });
      pending = answer.then(
        () => undefined,
        () => undefined,
      );
      return answer;
    },
  };
  const config: LandingBootConfig = {
    language: input.language,
    rootLanguage: 'fr',
    paths: landingPaths(),
    apiBase: 'https://gate.example',
    worldPath: worldEndpoints.root,
    sessionKey: SESSION_KEY,
    languageKey: INTERFACE_LANGUAGE_KEY,
    entryTemplate: WORLD_GUEST_ENTRY_TEMPLATE,
    threadTemplate: WORLD_GUEST_THREAD_TEMPLATE,
    handoffKey: WORLD_ENTRY_HANDOFF_KEY,
    appPath: href('list'),
    presence: LANDING_COPY[input.language].presence,
  };
  /* Le script est exécuté par son TEXTE, comme dans la page servie : une
     référence à une variable extérieure à `landingBoot` y lèverait. */
  new Function('window', (input.script ?? landingBootScript)(config))(fake);
  return {
    win: fake as unknown as Window & typeof globalThis,
    trace,
    settle: async () => {
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
};

const world = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  identifier: 'world',
  title: 'World Wide',
  shareLinkIdentifier: 'mshy_wx',
  memberCount: 42,
  ...overrides,
});

const visible = (selector: string): boolean => {
  const node = document.querySelector(selector);
  return node !== null && !node.hasAttribute('hidden');
};

beforeAll(() => ensureHappyDomRegistered({ url: 'https://meeshy.example/' }));
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

describe('le script de la landing — qui est là', () => {
  const session = (value: Record<string, unknown>) => ({ [SESSION_KEY]: JSON.stringify(value) });
  const future = Date.now() + 3_600_000;

  test('un compte valide ⇒ data-session="member", avant toute réponse réseau', () => {
    harness({ language: 'en', stored: session({ token: 't', sessionToken: 's', user: { id: 'u' }, expiresAt: future }) });
    expect(document.documentElement.getAttribute('data-session')).toBe('member');
  });

  test('une session expirée ou corrompue ⇒ personne', () => {
    harness({ language: 'en', stored: session({ token: 't', expiresAt: Date.now() - 1 }) });
    expect(document.documentElement.getAttribute('data-session')).toBe('none');
    harness({ language: 'en', stored: { [SESSION_KEY]: '{oops' } });
    expect(document.documentElement.getAttribute('data-session')).toBe('none');
  });

  test('un invité ⇒ data-session="guest"', () => {
    harness({ language: 'en', stored: session({ kind: 'guest', sessionToken: 's', expiresAt: future }) });
    expect(document.documentElement.getAttribute('data-session')).toBe('guest');
  });
});

describe('le script de la landing — la langue', () => {
  test('la racine rend la langue CHOISIE dans Meeshy, jamais celle du navigateur', () => {
    const { trace } = harness({ language: 'fr', stored: { [INTERFACE_LANGUAGE_KEY]: 'ar' } });
    expect(trace.replaced).toEqual(['/ar']);
    expect(harness({ language: 'fr' }).trace.replaced).toEqual([]);
  });

  test('l’application INSTALLÉE (PWA d’avant #10002, start_url sur /) ouvre la liste, jamais la landing', () => {
    expect(harness({ language: 'fr', installed: 'display-mode' }).trace.replaced).toEqual(['/chats']);
    expect(harness({ language: 'en', installed: 'ios-standalone' }).trace.replaced).toEqual(['/chats']);
    expect(harness({ language: 'fr', installed: 'display-mode', stored: { [INTERFACE_LANGUAGE_KEY]: 'ar' } }).trace.replaced).toEqual(['/chats']);
  });

  test('une landing de langue ne se redirige jamais', () => {
    expect(harness({ language: 'de', stored: { [INTERFACE_LANGUAGE_KEY]: 'it' } }).trace.replaced).toEqual([]);
  });

  test('le sélecteur retient le choix et ouvre la landing de cette langue', () => {
    const { trace, win } = harness({ language: 'fr' });
    const select = document.querySelector('[data-landing-language]') as HTMLSelectElement;
    select.value = 'es';
    select.dispatchEvent(new window.Event('change'));
    expect(trace.assigned).toEqual(['/es']);
    expect(win.localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe('es');
  });
});

describe('le script de la landing — GET /world (#10000)', () => {
  const PAYLOADS: readonly Record<string, unknown>[] = [
    world(),
    world({ memberCount: 199, memberCountCapped: true }),
    world({ memberCount: 0 }),
    world({ memberCount: -1 }),
    world({ memberCount: 1.5 }),
    world({ memberCount: '42' }),
    world({ memberCountCapped: false }),
    world({ shareLinkIdentifier: '' }),
    world({ title: undefined }),
    world({ identifier: 7 }),
  ];

  for (const data of PAYLOADS) {
    test(`même verdict que worldEntrySchema et formatMemberCount — ${JSON.stringify(data)}`, async () => {
      const { settle } = harness({ language: 'fr', response: { status: 200, body: { success: true, data } } });
      await settle();
      const parsed = worldEntrySchema.safeParse(data);
      expect(visible('[data-world-presence]')).toBe(parsed.success);
      if (!parsed.success) return;
      const expected = LANDING_COPY.fr.presence.replace(
        '{count}',
        formatMemberCount(parsed.data.memberCount, parsed.data.memberCountCapped),
      );
      expect(document.querySelector('[data-world-count]')?.textContent).toBe(expected);
    });
  }

  test('404 WORLD_UNAVAILABLE ⇒ l’entrée disparaît et la page le dit', async () => {
    const { settle } = harness({
      language: 'fr',
      response: { status: 404, body: { success: false, error: 'x', code: 'WORLD_UNAVAILABLE', message: 'x' } },
    });
    await settle();
    expect(visible('[data-world-form]')).toBe(false);
    expect(document.querySelectorAll('[data-world-entry]:not([hidden])').length).toBe(0);
    expect(visible('[data-world-unavailable]')).toBe(true);
  });

  test('une panne réseau ou une 500 laisse l’entrée en place', async () => {
    const { settle } = harness({ language: 'fr', response: { status: 500, body: null } });
    await settle();
    expect(visible('[data-world-form]')).toBe(true);
    expect(visible('[data-world-unavailable]')).toBe(false);
  });

  test('une panne réseau (fetch rejeté) laisse aussi l’entrée en place', async () => {
    const { settle } = harness({ language: 'fr', responses: ['network'] });
    await settle();
    expect(visible('[data-world-form]')).toBe(true);
    expect(visible('[data-world-error]')).toBe(false);
  });
});

const form = (): HTMLFormElement => document.querySelector('[data-world-form]') as HTMLFormElement;
const nameField = (): HTMLInputElement => form().querySelector('input[name="name"]') as HTMLInputElement;
const checkedLanguage = (): string | null =>
  (form().querySelector('input[name="language"]:checked') as HTMLInputElement | null)?.value ?? null;
const submit = () => form().dispatchEvent(new window.Event('submit', { cancelable: true }));
const typeName = (value: string) => {
  nameField().value = value;
  submit();
};
const pickLanguage = (code: string) => {
  (form().querySelector(`input[name="language"][value="${code}"]`) as HTMLInputElement).checked = true;
};

describe('le parcours nom → langue → World Wide (#10003)', () => {
  test('le nom ouvre l’étape de la LANGUE, sans rien envoyer ni quitter la page', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    await settle();
    typeName('Kenji');
    expect(trace.assigned).toEqual([]);
    expect(visible('[data-world-step="name"]')).toBe(false);
    expect(visible('[data-world-step="language"]')).toBe(true);
    expect(document.activeElement).toBe(form().querySelector('input[name="language"]:checked'));
  });

  test('un nom vide ne passe pas', async () => {
    const { settle } = harness({ language: 'fr' });
    await settle();
    typeName('   ');
    expect(visible('[data-world-step="name"]')).toBe(true);
    expect(visible('[data-world-step="language"]')).toBe(false);
  });

  test('la langue de l’APPAREIL est proposée parmi les sept ; sinon celle de la page', async () => {
    harness({ language: 'en', deviceLanguages: ['ar-MA', 'fr-FR'] });
    typeName('Kenji');
    expect(checkedLanguage()).toBe('ar');
    harness({ language: 'de', deviceLanguages: ['ja-JP', 'pt-BR'] });
    typeName('Kenji');
    expect(checkedLanguage()).toBe('pt');
    harness({ language: 'it', deviceLanguages: ['ja-JP'] });
    typeName('Kenji');
    expect(checkedLanguage()).toBe('it');
  });

  test('la langue se dit dans son écriture, l’arabe de droite à gauche', () => {
    harness({ language: 'fr' });
    const arabic = form().querySelector('input[name="language"][value="ar"]')?.closest('label');
    expect(arabic?.getAttribute('dir')).toBe('rtl');
    expect(arabic?.getAttribute('lang')).toBe('ar');
    expect(arabic?.textContent).toContain('العربية');
  });

  test('valider la langue entre par la clé SERVIE, nom et langue encodés, et la langue devient celle de l’interface', async () => {
    const { trace, win, settle } = harness({ language: 'fr' });
    await settle();
    typeName('  Amina & co ');
    pickLanguage('ar');
    submit();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Amina%20%26%20co&language=ar']);
    expect(win.localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe('ar');
  });

  test('avant de naviguer, la landing pose dans l’ONGLET le jeton de passage : la clé servie, le nom rogné, la langue, l’instant (#10094)', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    await settle();
    const before = Date.now();
    typeName('  Amina & co ');
    pickLanguage('ar');
    submit();
    expect(trace.assigned.length).toBe(1);
    const token: unknown = JSON.parse(trace.handoffAtAssign[0] ?? 'null');
    expect(token).toMatchObject({ link: 'mshy_wx', name: 'Amina & co', language: 'ar' });
    const at: unknown = typeof token === 'object' && token !== null ? Reflect.get(token, 'at') : null;
    expect(typeof at === 'number' && at >= before && at <= Date.now()).toBe(true);
  });

  test('un onglet sans sessionStorage navigue quand même : sans jeton, la jonction demandera le geste (#10094)', async () => {
    const { trace, settle } = harness({ language: 'fr', sessionRefused: true });
    await settle();
    typeName('Kenji');
    pickLanguage('es');
    submit();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Kenji&language=es']);
  });

  test('un COMPTE qui entre en anonyme garde la langue de son interface', async () => {
    const stored = { [SESSION_KEY]: JSON.stringify({ token: 't', sessionToken: 's', user: { id: 'u' }, expiresAt: Date.now() + 3_600_000 }) };
    const { trace, win, settle } = harness({ language: 'en', stored });
    await settle();
    typeName('Ada');
    pickLanguage('es');
    submit();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Ada&language=es']);
    expect(win.localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe(null);
  });

  test('« Retour » rend le nom, gardé, et le focus — le bouton comme Échap comme l’historique', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    await settle();
    typeName('Kenji');
    expect(trace.pushed.length).toBe(1);
    (document.querySelector('[data-world-back]') as HTMLButtonElement).click();
    expect(visible('[data-world-step="name"]')).toBe(true);
    expect(visible('[data-world-step="language"]')).toBe(false);
    expect(nameField().value).toBe('Kenji');
    expect(document.activeElement).toBe(nameField());

    typeName('Kenji');
    form().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(visible('[data-world-step="name"]')).toBe(true);

    typeName('Kenji');
    window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
    expect(visible('[data-world-step="name"]')).toBe(true);
    expect(trace.assigned).toEqual([]);
  });

  test('un choix de langue fait n’est pas recouvert en revenant au nom', async () => {
    const { settle } = harness({ language: 'en', deviceLanguages: ['de-DE'] });
    await settle();
    typeName('Kenji');
    pickLanguage('pt');
    (document.querySelector('[data-world-back]') as HTMLButtonElement).click();
    typeName('Kenji');
    expect(checkedLanguage()).toBe('pt');
  });

  test('une entrée validée avant la réponse attend la clé, puis entre', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    typeName('Kenji');
    submit();
    expect(trace.assigned).toEqual([]);
    await settle();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Kenji&language=fr']);
  });
});

describe('jamais un bouton inerte quand GET /world échoue (#10067)', () => {
  for (const failure of [{ status: 500, body: null }, 'network'] as const) {
    test(`${failure === 'network' ? 'réseau coupé' : '500'} : la soumission relance la lecture, puis DIT l’échec ; le geste suivant réessaie`, async () => {
      const { trace, settle } = harness({ language: 'es', responses: [failure, failure, { status: 200, body: { success: true, data: world() } }] });
      await settle();
      expect(trace.fetches).toBe(1);
      typeName('Kenji');
      submit();
      expect(trace.fetches).toBe(2);
      await settle();
      expect(trace.assigned).toEqual([]);
      expect(visible('[data-world-error]')).toBe(true);
      expect(document.querySelector('[data-world-error]')?.textContent).toBe(LANDING_COPY.es.entryFailed);

      submit();
      expect(trace.fetches).toBe(3);
      await settle();
      expect(visible('[data-world-error]')).toBe(false);
      expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Kenji&language=es']);
    });
  }

  test('une lecture en cours n’est pas doublée par un second geste', async () => {
    const { trace } = harness({ language: 'fr' });
    typeName('Kenji');
    submit();
    submit();
    expect(trace.fetches).toBe(1);
  });
});

describe('un invité revient dans World Wide (#10003)', () => {
  const guest = (link: string) => ({
    [SESSION_KEY]: JSON.stringify({
      kind: 'guest',
      sessionToken: 's',
      guest: { participantId: 'p', nickname: 'Kenji', conversationId: 'c-world', link, mayWrite: true, language: 'fr' },
      expiresAt: Date.now() + 3_600_000,
    }),
  });

  test('une session invité de World Wide propose « Revenir dans World Wide », vers son fil', async () => {
    const { settle } = harness({ language: 'fr', stored: guest('mshy_wx') });
    expect(visible('[data-world-return]')).toBe(true);
    expect(document.querySelector('[data-world-return]')?.getAttribute('href')).toBe('/c/c-world');
    await settle();
    expect(visible('[data-world-return]')).toBe(true);
  });

  test('une session invité d’un AUTRE lien ne le propose pas', async () => {
    const { settle } = harness({ language: 'fr', stored: guest('mshy_autre') });
    await settle();
    expect(visible('[data-world-return]')).toBe(false);
  });

  test('sans session invité, rien n’est proposé', async () => {
    const { settle } = harness({ language: 'fr' });
    await settle();
    expect(visible('[data-world-return]')).toBe(false);
  });
});

describe('le script MINIFIÉ que le prérendu inline (#10003)', () => {
  test('plus court que sa source, il se comporte comme elle : qui est là, nom, langue, entrée', async () => {
    const configs: LandingBootConfig[] = [];
    harness({ language: 'ar', script: (config) => (configs.push(config), landingBootScript(config)) });
    const source = landingBootScript(configs[0] as LandingBootConfig);
    const minified = await minifyInlineScript(source);
    expect(minified.length).toBeLessThan(source.length);

    const stored = { [SESSION_KEY]: JSON.stringify({ kind: 'guest', sessionToken: 's', expiresAt: Date.now() + 3_600_000 }) };
    const { trace, settle } = harness({ language: 'ar', stored, deviceLanguages: ['es-MX'], script: () => minified });
    expect(document.documentElement.getAttribute('data-session')).toBe('guest');
    await settle();
    typeName('Luiza');
    expect(checkedLanguage()).toBe('es');
    submit();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Luiza&language=es']);
  });
});
