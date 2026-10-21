import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
import { worldEntrySchema } from '@meeshy/shared/types/world';
import { formatMemberCount } from '@meeshy/shared/utils/member-visibility';

import { SESSION_STORAGE_KEY } from '@/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '@/lib/inline-interface-language-bootstrap.js';
import { href } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { LandingBootConfig } from './landing-boot';
import { LANDING_COPY } from './landing-copy';
import { minifyInlineScript } from '../../scripts/lib/minify-inline-script';
import { landingBootScript, landingDocument, landingOgImagePath } from './landing-document';
import { LANDING_LANGUAGES, landingPath, landingPaths, type LandingLanguage } from './landing-languages';
import { WORLD_ENTRY_HANDOFF_KEY, WORLD_GUEST_THREAD_TEMPLATE } from './world-entry';

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
      threadTemplate: WORLD_GUEST_THREAD_TEMPLATE,
      appPath: href('list'),
    },
  });

/** Le libellé de l'ancien bouton, dans les sept langues : il ne doit plus paraître nulle part (#10784). */
const OLD_ENTER_WITHOUT_ACCOUNT: Readonly<Record<LandingLanguage, string>> = {
  fr: 'Entrer sans compte',
  en: 'Join without an account',
  es: 'Entrar sin cuenta',
  pt: 'Entrar sem conta',
  de: 'Ohne Konto eintreten',
  it: 'Entra senza account',
  ar: 'الدخول دون حساب',
};

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

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

      const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';

      test('le corps porte la planche « Main » : héros, connexion, pied légal', () => {
        expect(body).toContain(copy.headline);
        for (const path of ['/login', '/chats', '/signup', '/help', '/faq', '/privacy', '/terms']) {
          expect(body).toContain(`href="${path}"`);
        }
        expect(body).toContain('src="/brand/logo.png"');
        expect(body).toContain('data-world-return');
      });

      test('aucune entrée anonyme en un clic : ni formulaire, ni « Entrer sans compte », ni champ de nom (#10784)', () => {
        expect(body).not.toContain('data-world-form');
        expect(body).not.toContain('data-world-cta');
        expect(body).not.toContain('<form');
        expect(body).not.toContain('name="name"');
        expect(body).not.toContain('#rejoindre');
        for (const other of LANDING_LANGUAGES) {
          expect(body).not.toContain(OLD_ENTER_WITHOUT_ACCOUNT[other]);
        }
      });

      test('un QR code vers /world, légendé et décrit dans la langue de la page, dans le héros ET dans la section World Wide (#10784)', () => {
        const figures = [...body.matchAll(/<figure[^>]*data-world-qr[^>]*>[\s\S]*?<\/figure>/g)].map((m) => m[0]);
        expect(figures).toHaveLength(2);
        for (const figure of figures) {
          expect(figure).toContain('data-world-entry');
          expect(figure).toMatch(/<img[^>]*src="\/world-qr\.svg"/);
          expect(figure).toContain(`alt="${escapeAttribute(copy.worldQrAlt)}"`);
          expect(figure).toContain(escapeAttribute(copy.worldQrCaption));
          expect(figure).not.toMatch(/<a[^>]*>\s*<img/);
        }
        expect(body.indexOf('data-world-qr')).toBeLessThan(body.indexOf('id="world"'));
        expect(body.lastIndexOf('data-world-qr')).toBeGreaterThan(body.indexOf('id="world"'));
      });

      test('sous chaque QR, le lien de partage en clair vers /world — un lien texte, jamais un bouton (#10811)', () => {
        const figures = [...body.matchAll(/<figure[^>]*data-world-qr[^>]*>[\s\S]*?<\/figure>/g)].map((m) => m[0]);
        for (const figure of figures) {
          const link = /<a[^>]*data-world-link[^>]*>([\s\S]*?)<\/a>/.exec(figure);
          expect(link?.[0]).toContain('href="/world"');
          expect(link?.[0]).not.toContain('ld-btn');
          expect(link?.[1]).toBe('meeshy.me/world');
          expect(figure).toContain(escapeAttribute(copy.worldLinkLead));
        }
        if (language !== 'fr') expect(copy.worldLinkLead).not.toBe(LANDING_COPY.fr.worldLinkLead);
      });

      test('la légende et la description du QR sont propres à la langue', () => {
        expect(copy.worldQrAlt).toContain('meeshy.me/world');
        expect(copy.worldQrCaption).toContain('World Wide');
        if (language !== 'fr') expect(copy.worldQrCaption).not.toBe(LANDING_COPY.fr.worldQrCaption);
      });

      test('la note ne promet plus d’étape « juste après » (#10098)', () => {
        expect(copy.joinNote).not.toMatch(/après|after|después|depois|danach|dopo|بعد ذلك/);
      });
    });
  }
});

describe('le retour d’un invité (#10100)', () => {
  test('vise /world, où son fil s’ouvre en focus', () => {
    expect(WORLD_GUEST_THREAD_TEMPLATE.replace('{conversation}', 'C')).toBe(href('world'));
  });
});

type Trace = {
  readonly assigned: string[];
  readonly replaced: string[];
  /** Ce que le script a écrit dans l'onglet — il n'y pose plus rien (#10784). */
  readonly tab: Map<string, string>;
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
}): Harness => {
  const html = documentFor(input.language);
  document.documentElement.removeAttribute('data-session');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  const stored = new Map(Object.entries(input.stored ?? {}));
  const tab = new Map<string, string>();
  const trace: Trace = { assigned: [], replaced: [], tab, fetches: 0 };
  const answers: readonly Answer[] = input.responses ?? [input.response ?? { status: 200, body: { success: true, data: world() } }];
  let pending: Promise<unknown> = Promise.resolve();
  const fake = {
    document,
    HTMLSelectElement: window.HTMLSelectElement,
    matchMedia: (query: string) => ({ matches: input.installed === 'display-mode' && query === '(display-mode: standalone)' }),
    navigator: {
      ...(input.installed === 'ios-standalone' ? { standalone: true } : {}),
      ...(input.deviceLanguages === undefined ? {} : { languages: input.deviceLanguages }),
    },
    addEventListener: (type: string, listener: EventListener) => window.addEventListener(type, listener),
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
    sessionStorage: {
      getItem: (key: string) => tab.get(key) ?? null,
      setItem: (key: string, value: string) => void tab.set(key, value),
    },
    location: {
      search: '',
      hash: '',
      assign: (to: string) => void trace.assigned.push(to),
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
    threadTemplate: WORLD_GUEST_THREAD_TEMPLATE,
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

  const member = { [SESSION_KEY]: JSON.stringify({ token: 't', sessionToken: 's', user: { id: 'u' }, expiresAt: Date.now() + 60_000 }) };

  for (const data of PAYLOADS) {
    test(`un COMPTE lit l’effectif au même verdict que worldEntrySchema et formatMemberCount — ${JSON.stringify(data)}`, async () => {
      const { settle } = harness({ language: 'fr', stored: member, response: { status: 200, body: { success: true, data } } });
      await settle();
      const parsed = worldEntrySchema.safeParse(data);
      const counted = parsed.success && parsed.data.memberCount !== undefined;
      expect(visible('[data-world-presence]')).toBe(counted);
      if (!parsed.success || parsed.data.memberCount === undefined) return;
      const expected = LANDING_COPY.fr.presence.replace(
        '{count}',
        formatMemberCount(parsed.data.memberCount, parsed.data.memberCountCapped),
      );
      expect(document.querySelector('[data-world-count]')?.textContent).toBe(expected);
    });

    test(`un visiteur sans compte ne lit JAMAIS l’effectif (#10205) — ${JSON.stringify(data)}`, async () => {
      const { settle } = harness({ language: 'fr', response: { status: 200, body: { success: true, data } } });
      await settle();
      expect(visible('[data-world-presence]')).toBe(false);
      expect(document.querySelector('[data-world-count]')?.textContent ?? '').toBe('');
    });
  }

  test('un serveur qui ne sert plus l’effectif laisse le QR en place, sans pastille (#10205, #10784)', async () => {
    const { trace, settle } = harness({
      language: 'fr',
      response: { status: 200, body: { success: true, data: world({ memberCount: undefined }) } },
    });
    await settle();
    expect(visible('[data-world-presence]')).toBe(false);
    expect(qrShown()).toEqual([true, true]);
    expect(trace.assigned).toEqual([]);
  });

  test('404 WORLD_UNAVAILABLE ⇒ les QR disparaissent et la page le dit (#10784)', async () => {
    const { settle } = harness({
      language: 'fr',
      response: { status: 404, body: { success: false, error: 'x', code: 'WORLD_UNAVAILABLE', message: 'x' } },
    });
    await settle();
    expect(qrShown()).toEqual([false, false]);
    expect(document.querySelectorAll('[data-world-entry]:not([hidden])').length).toBe(0);
    expect(visible('[data-world-unavailable]')).toBe(true);
  });

  for (const failure of [{ status: 500, body: null }, 'network'] as const) {
    test(`${failure === 'network' ? 'une panne réseau' : 'une 500'} laisse les QR en place, sans relance`, async () => {
      const { trace, settle } = harness({ language: 'fr', responses: [failure] });
      await settle();
      expect(qrShown()).toEqual([true, true]);
      expect(visible('[data-world-unavailable]')).toBe(false);
      expect(trace.fetches).toBe(1);
    });
  }

  test('la landing ne pose plus aucun jeton de passage dans l’onglet, et ne navigue jamais seule (#10784)', async () => {
    const { trace, settle } = harness({ language: 'fr' });
    await settle();
    expect(trace.tab.has(WORLD_ENTRY_HANDOFF_KEY)).toBe(false);
    expect(trace.tab.size).toBe(0);
    expect(trace.assigned).toEqual([]);
  });
});

const qrShown = (): readonly boolean[] => Array.from(document.querySelectorAll('[data-world-qr]')).map((node) => !node.hasAttribute('hidden'));

describe('un invité revient dans World Wide (#10003)', () => {
  const guest = (link: string) => ({
    [SESSION_KEY]: JSON.stringify({
      kind: 'guest',
      sessionToken: 's',
      guest: { participantId: 'p', nickname: 'Kenji', conversationId: 'c-world', link, mayWrite: true, language: 'fr' },
      expiresAt: Date.now() + 3_600_000,
    }),
  });

  test('une session invité de World Wide propose « Revenir dans World Wide », vers /world (#10100)', async () => {
    const { settle } = harness({ language: 'fr', stored: guest('mshy_wx') });
    expect(visible('[data-world-return]')).toBe(true);
    expect(document.querySelector('[data-world-return]')?.getAttribute('href')).toBe('/world');
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
  test('plus court que sa source, il se comporte comme elle : qui est là, retour de l’invité, fermeture de World Wide', async () => {
    const configs: LandingBootConfig[] = [];
    harness({ language: 'ar', script: (config) => (configs.push(config), landingBootScript(config)) });
    const source = landingBootScript(configs[0] as LandingBootConfig);
    const minified = await minifyInlineScript(source);
    expect(minified.length).toBeLessThan(source.length);

    const stored = {
      [SESSION_KEY]: JSON.stringify({
        kind: 'guest',
        sessionToken: 's',
        guest: { conversationId: 'c-world', link: 'mshy_wx' },
        expiresAt: Date.now() + 3_600_000,
      }),
    };
    const { settle } = harness({ language: 'ar', stored, script: () => minified });
    expect(document.documentElement.getAttribute('data-session')).toBe('guest');
    await settle();
    expect(visible('[data-world-return]')).toBe(true);

    const closed = harness({
      language: 'ar',
      response: { status: 404, body: { success: false, error: 'x', code: 'WORLD_UNAVAILABLE', message: 'x' } },
      script: () => minified,
    });
    await closed.settle();
    expect(qrShown()).toEqual([false, false]);
  });
});
