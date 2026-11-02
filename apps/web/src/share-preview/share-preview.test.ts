import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { OG_IMAGE_SIZE, landingOgImagePath } from '@/landing/landing-document';
import { LANDING_LANGUAGES, OG_LOCALES } from '@/landing/landing-languages';

import {
  BRAND_OG_IMAGE_PATH,
  SHARE_PREVIEW_FAMILIES,
  SHARE_PREVIEW_LANGUAGE_RULES,
  SHARE_PREVIEW_ROUTES,
  SHARE_PREVIEW_BOT_AGENTS,
  SHELL_TITLE,
  isSharePreviewBot,
  sharePreviewFamily,
  sharePreviewFile,
  sharePreviewHead,
  sharePreviewLanguage,
  sharePreviewShell,
} from './share-preview';
import { SHARE_PREVIEW_COPY } from './share-preview-copy';

/**
 * #10192 — chaque adresse de l'application se déplie chez un robot de
 * messagerie avec un aperçu juste, et aucun ne dit rien de ce qu'elle désigne.
 */
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const NGINX = read('../../nginx.conf');
const TRAEFIK = ['docker-compose.staging.yml', 'docker-compose.prod.yml'].map((file) => read(`../../../../infrastructure/docker/compose/${file}`));
const VITE = read('../../vite.config.ts') + read('../../vite/pwa.ts');
const ORIGIN = 'https://meeshy.me';

const SHELL = `<!doctype html>
<html lang="fr" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Messagerie multilingue en temps réel" />
    <link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
    ${SHELL_TITLE}
    <script>/*schema*/</script>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const meta = (html: string, key: string): string | null =>
  new RegExp(`<meta (?:property|name)="${key.replace(/:/g, ':')}" content="([^"]*)">`).exec(html)?.[1] ?? null;

describe('la famille d’une adresse', () => {
  const cases = [
    ['/world', 'world'],
    ['/world/', 'world'],
    ['/login', 'login'],
    ['/signup', 'signup'],
    ['/signup/affiliate/aff_123', 'signup'],
    ['/c/64f0c0ffee0000000000abcd', 'conversation'],
    ['/chat/mshy_abc', 'invitation'],
    ['/l/Ab3xYz', 'link'],
    ['/l/Ab3xYz/expired', 'link'],
    ['/chats', 'app'],
    ['/settings', 'app'],
    ['/u/zoe', 'app'],
    ['/worldwide', 'app'],
    ['/loginx', 'app'],
  ] as const;
  for (const [path, family] of cases) {
    test(`${path} → ${family}`, () => {
      expect(sharePreviewFamily(path)).toBe(family);
    });
  }
});

describe('la langue de l’aperçu, lue sur la requête du robot', () => {
  const cases: readonly (readonly [{ readonly facebookLocale?: string; readonly acceptLanguage?: string }, string])[] = [
    [{}, 'fr'],
    [{ acceptLanguage: 'en-US,en;q=0.9' }, 'en'],
    [{ acceptLanguage: 'pt-BR' }, 'pt'],
    [{ acceptLanguage: 'AR-sa' }, 'ar'],
    [{ acceptLanguage: 'de' }, 'de'],
    [{ acceptLanguage: 'fr-FR,en;q=0.5' }, 'fr'],
    [{ acceptLanguage: 'ja,en;q=0.8' }, 'fr'],
    [{ acceptLanguage: 'english' }, 'fr'],
    [{ facebookLocale: 'es_ES', acceptLanguage: 'en-US' }, 'es'],
    [{ facebookLocale: 'fr_FR', acceptLanguage: 'en-US' }, 'fr'],
    [{ facebookLocale: 'ja_JP', acceptLanguage: 'it-IT' }, 'it'],
  ];
  for (const [headers, language] of cases) {
    test(`${JSON.stringify(headers)} → ${language}`, () => {
      expect(sharePreviewLanguage(headers)).toBe(language);
    });
  }
});

describe('le document d’aperçu', () => {
  for (const family of SHARE_PREVIEW_FAMILIES) {
    for (const language of LANDING_LANGUAGES) {
      test(`${family} · ${language} — titre, description, image 1200 × 630, langue`, () => {
        const html = sharePreviewShell(SHELL, { family, language, origin: ORIGIN });
        const copy = SHARE_PREVIEW_COPY[language][family];
        expect(html).toContain(`<title>${copy.title}</title>`);
        expect(meta(html, 'og:title')).toBe(copy.title);
        expect(meta(html, 'twitter:title')).toBe(copy.title);
        expect(meta(html, 'og:description')).toBe(copy.description);
        expect(meta(html, 'twitter:description')).toBe(copy.description);
        expect(meta(html, 'description')).toBe(copy.description);
        const imagePath = family === 'world' ? landingOgImagePath(language) : BRAND_OG_IMAGE_PATH;
        expect(meta(html, 'og:image')).toBe(`${ORIGIN}${imagePath}`);
        expect(meta(html, 'twitter:image')).toBe(`${ORIGIN}${imagePath}`);
        expect(meta(html, 'og:image:width')).toBe(String(OG_IMAGE_SIZE.width));
        expect(meta(html, 'og:image:height')).toBe(String(OG_IMAGE_SIZE.height));
        expect(meta(html, 'og:image:alt')?.length).toBeGreaterThan(10);
        expect(meta(html, 'twitter:card')).toBe('summary_large_image');
        expect(meta(html, 'og:locale')).toBe(OG_LOCALES[language]);
        expect([...html.matchAll(/property="og:locale:alternate"/g)]).toHaveLength(LANDING_LANGUAGES.length - 1);
        expect([...copy.title].length).toBeLessThanOrEqual(70);
        expect([...copy.description].length).toBeLessThanOrEqual(155);
      });
    }
  }

  test('une adresse FIXE se nomme ; une adresse dynamique ne porte aucune adresse', () => {
    const url = (family: (typeof SHARE_PREVIEW_FAMILIES)[number]) => meta(sharePreviewHead({ family, language: 'fr', origin: ORIGIN }), 'og:url');
    expect(url('world')).toBe(`${ORIGIN}/world`);
    expect(url('login')).toBe(`${ORIGIN}/login`);
    expect(url('signup')).toBe(`${ORIGIN}/signup`);
    for (const family of ['conversation', 'invitation', 'link', 'app'] as const) expect(url(family)).toBeNull();
  });

  test('une famille dynamique ne dit rien de ce que l’adresse désigne — le même texte pour toutes', () => {
    for (const family of ['conversation', 'invitation', 'link', 'app'] as const) {
      const head = sharePreviewHead({ family, language: 'fr', origin: ORIGIN });
      expect(head).not.toMatch(/\/c\/|\/chat\/|\/l\/|mshy_|[0-9a-f]{24}/);
    }
  });

  test('seuls le titre et la description de la coquille changent : corps et scripts sont ceux de index.html', () => {
    const html = sharePreviewShell(SHELL, { family: 'conversation', language: 'ar', origin: ORIGIN });
    const head = sharePreviewHead({ family: 'conversation', language: 'ar', origin: ORIGIN });
    expect(html.replace(head, SHELL_TITLE)).toBe(SHELL.replace(/\n\s*<meta name="description" content="[^"]*"\s*\/?>/, ''));
    expect(html).toContain('<html lang="fr" class="dark">');
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-abc123.js"></script>');
  });

  test('une coquille sans titre ni description refuse d’être habillée — la construction s’arrête', () => {
    expect(() => sharePreviewShell(SHELL.replace(SHELL_TITLE, '<title>Autre</title>'), { family: 'app', language: 'fr', origin: ORIGIN })).toThrow();
    expect(() => sharePreviewShell(SHELL.replace(/<meta name="description"[^>]*>/, ''), { family: 'app', language: 'fr', origin: ORIGIN })).toThrow();
  });

  test('chaque valeur est échappée', () => {
    const head = sharePreviewHead({ family: 'app', language: 'fr', origin: 'https://x.test/"><script>' });
    expect(head).not.toContain('"><script>');
    expect(head).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('nginx.conf — la famille et la langue sont des MIROIRS de ce module', () => {
  const mapBody = (variable: string): readonly string[] =>
    (new RegExp(`map [^\\n]* \\$${variable} \\{\\n([\\s\\S]*?)\\n\\s*\\}`).exec(NGINX)?.[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

  test('la famille se lit sur le chemin, dans le même ordre', () => {
    expect(mapBody('meeshy_og_family')).toEqual(['default app;', ...SHARE_PREVIEW_ROUTES.map(({ pattern, family }) => `~${pattern} ${family};`)]);
    expect(NGINX).toMatch(/map \$uri \$meeshy_og_family \{/);
  });

  test('la langue se lit sur X-Facebook-Locale puis Accept-Language, dans le même ordre', () => {
    expect(mapBody('meeshy_og_lang')).toEqual(['default fr;', ...SHARE_PREVIEW_LANGUAGE_RULES.map(({ pattern, language }) => `~*${pattern} ${language};`)]);
    expect(NGINX).toContain('map "$http_x_facebook_locale|$http_accept_language" $meeshy_og_lang {');
  });

  test('seul un robot d’aperçu reçoit la copie ; un navigateur reçoit index.html', () => {
    expect(mapBody('meeshy_preview_bot')).toEqual(['default 0;', `~*(${SHARE_PREVIEW_BOT_AGENTS}) 1;`]);
    expect(mapBody('meeshy_app_document')).toEqual(['default /index.html;', '1 /shell-og/$meeshy_og_family/$meeshy_og_lang.html;']);
    expect(NGINX).toMatch(/location @app \{[\s\S]*?rewrite \^ \$meeshy_app_document last;/);
  });

  test('la coquille habillée n’a pas d’adresse publique, et retombe sur index.html si elle manque', () => {
    expect(NGINX).toMatch(/location \/shell-og\/ \{\n\s+internal;[\s\S]*?try_files \$uri \/index\.html;/);
    expect(sharePreviewFile('link', 'de')).toBe('shell-og/link/de.html');
  });

  test('la copie dit au cache qu’elle varie selon la langue demandée', () => {
    expect(NGINX).toMatch(/location \/shell-og\/ \{[\s\S]*?add_header Vary "User-Agent, Accept-Language, X-Facebook-Locale" always;/);
  });
});

describe('les robots d’aperçu — la liste des routeurs Traefik *-unfurl', () => {
  test('la liste est celle des routeurs de la passerelle, staging et production', () => {
    for (const compose of TRAEFIK) {
      const agents = [...compose.matchAll(/HeaderRegexp\(`User-Agent`, `\(\?i\)\(([^`]+)\)`\)/g)].map((m) => m[1]);
      expect(agents.length).toBeGreaterThanOrEqual(2);
      expect(new Set(agents)).toEqual(new Set([SHARE_PREVIEW_BOT_AGENTS]));
    }
  });

  const ROBOTS = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'WhatsApp/2.23.20.0 A',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  ];
  const HUMAINS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/620000000]',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LinkedInApp/9.29',
  ];

  test('reconnaît les robots des messageries, jamais un navigateur ni un navigateur intégré', () => {
    expect(ROBOTS.filter((agent) => !isSharePreviewBot(agent))).toEqual([]);
    expect(HUMAINS.filter((agent) => isSharePreviewBot(agent))).toEqual([]);
  });
});

describe('construction (vite.config.ts)', () => {
  test('les copies n’entrent pas au précache — la coquille précachée sert les humains', () => {
    expect(VITE).toContain("'shell-og/**'");
  });

  test('les copies ne sont écrites que pour le web, jamais dans la coque', () => {
    expect(VITE).toContain("'scripts/prerender-share-previews.ts'");
    expect(VITE).toContain('...(forCapacitor ? [] : [prerenderLanding()]),');
  });

  test('l’image de marque est une PNG 1200 × 630', () => {
    const png = readFileSync(new URL(`../../public${BRAND_OG_IMAGE_PATH}`, import.meta.url));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ ...OG_IMAGE_SIZE });
  });
});
