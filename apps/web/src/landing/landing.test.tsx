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
import { landingBootScript, landingDocument, landingOgImagePath } from './landing-document';
import { LANDING_LANGUAGES, landingPath, landingPaths, type LandingLanguage } from './landing-languages';
import { WORLD_GUEST_ENTRY_TEMPLATE } from './world-entry';

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
    });
  }
});

describe('le point d’accroche de l’entrée invité (#10003)', () => {
  test('vise la jonction par lien que la table des routes sert, en mode invité', () => {
    expect(WORLD_GUEST_ENTRY_TEMPLATE.replace('{link}', 'L').replace('{name}', 'N')).toBe(
      href('chatJoin', { link: 'L' }, { mode: ANONYMOUS_MODE, name: 'N' }),
    );
  });
});

type Trace = { readonly assigned: string[]; readonly replaced: string[] };

type Harness = { readonly win: Window & typeof globalThis; readonly trace: Trace; readonly settle: () => Promise<void> };

const harness = (input: {
  readonly language: LandingLanguage;
  readonly stored?: Readonly<Record<string, string>>;
  readonly response?: { readonly status: number; readonly body: unknown };
}): Harness => {
  const html = documentFor(input.language);
  document.documentElement.removeAttribute('data-session');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  const stored = new Map(Object.entries(input.stored ?? {}));
  const trace: Trace = { assigned: [], replaced: [] };
  const response = input.response ?? { status: 200, body: { success: true, data: world() } };
  let pending: Promise<unknown> = Promise.resolve();
  const fake = {
    document,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLFormElement: window.HTMLFormElement,
    HTMLInputElement: window.HTMLInputElement,
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
    location: {
      search: '',
      hash: '',
      assign: (to: string) => void trace.assigned.push(to),
      replace: (to: string) => void trace.replaced.push(to),
    },
    fetch: () => {
      const answer = Promise.resolve({
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: () => Promise.resolve(response.body),
      });
      pending = answer.then(() => undefined);
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
    presence: LANDING_COPY[input.language].presence,
  };
  /* Le script est exécuté par son TEXTE, comme dans la page servie : une
     référence à une variable extérieure à `landingBoot` y lèverait. */
  new Function('window', landingBootScript(config))(fake);
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

  test('le nom saisi entre par la clé de jonction SERVIE, encodée', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    await settle();
    const form = document.querySelector('[data-world-form]') as HTMLFormElement;
    (form.querySelector('input[name="name"]') as HTMLInputElement).value = '  Amina & co ';
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Amina%20%26%20co']);
  });

  test('un nom saisi avant la réponse attend la clé, puis entre', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    const form = document.querySelector('[data-world-form]') as HTMLFormElement;
    (form.querySelector('input[name="name"]') as HTMLInputElement).value = 'Kenji';
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    expect(trace.assigned).toEqual([]);
    await settle();
    expect(trace.assigned).toEqual(['/chat/mshy_wx?mode=anonymous&name=Kenji']);
  });
});
