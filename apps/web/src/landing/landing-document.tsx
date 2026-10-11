import { renderToStaticMarkup } from 'react-dom/server';

import { BRAND_LOGO_PATH } from '@/lib/brand';

import { isInstalledApp, landingBoot, type LandingBootConfig } from './landing-boot';
import { LANDING_COPY } from './landing-copy';
import {
  LANDING_LANGUAGES,
  OG_LOCALES,
  ROOT_LANDING_LANGUAGE,
  landingDirection,
  landingPath,
  landingPaths,
  type LandingLanguage,
} from './landing-languages';
import { LandingPage } from './landing-page';

/**
 * LE DOCUMENT D'UNE LANDING (#10002, note « seo » de la planche) — ce que le
 * prérendu écrit, une fois par langue.
 *
 * Tout ce qu'un robot ou une carte d'aperçu lit est ICI, dans le HTML servi :
 * `title`, description, `canonical`, `hreflang` × 7 + `x-default`, Open Graph
 * (image 1200 × 630), carte Twitter, JSON-LD `Organization` + `WebApplication`.
 * Un `<title>` posé par JavaScript arriverait après le robot.
 *
 * Aucun script EXTERNE : la feuille est inlinée, le schéma et le comportement
 * de la page aussi (`landingBoot`, inliné par son texte). Le document se peint
 * sans le socle de l'application.
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function landingOgImagePath(language: LandingLanguage): string {
  return `/og/landing-${language}-v1.png`;
}

export type LandingDocumentInput = {
  readonly language: LandingLanguage;
  readonly origin: string;
  readonly sheet: string;
  readonly schemeScript: string;
  /** Les deux `theme-color` (sombre, clair) — fournis par le prérendu, comme la feuille. */
  readonly themeColors: { readonly dark: string; readonly light: string };
  readonly boot: LandingBootInput;
  /** Le script de la page, déjà composé (et minifié par le prérendu,
   * `scripts/lib/minify-inline-script.ts`) ; sinon composé ici, tel quel. */
  readonly bootScript?: string;
};

export type LandingBootInput = Omit<LandingBootConfig, 'language' | 'rootLanguage' | 'paths' | 'presence'>;

/** La configuration COMPLÈTE du script d'une landing — ce qui change d'une langue à l'autre compris. */
export function landingBootConfig(language: LandingLanguage, boot: LandingBootInput): LandingBootConfig {
  return {
    ...boot,
    language,
    rootLanguage: ROOT_LANDING_LANGUAGE,
    paths: landingPaths(),
    presence: LANDING_COPY[language].presence,
  };
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Un JSON posé dans un `<script>` ne doit jamais pouvoir le refermer. */
const inlineJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

export function landingBootScript(config: LandingBootConfig): string {
  return `(function(){${isInstalledApp.toString()};(${landingBoot.toString()})(window,${inlineJson(config)});})();`;
}

export function landingStructuredData(language: LandingLanguage, origin: string): unknown {
  const copy = LANDING_COPY[language];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Meeshy',
        url: `${origin}/`,
        logo: `${origin}${BRAND_LOGO_PATH}`,
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name: 'Meeshy',
        url: `${origin}${landingPath(language)}`,
        description: copy.metaDescription,
        inLanguage: language,
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Web, Android, iOS',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        publisher: { '@id': `${origin}/#organization` },
      },
    ],
  };
}

export function landingHead(language: LandingLanguage, origin: string): string {
  const copy = LANDING_COPY[language];
  const url = `${origin}${landingPath(language)}`;
  const image = `${origin}${landingOgImagePath(language)}`;
  const alternates = LANDING_LANGUAGES.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="${escapeHtml(`${origin}${landingPath(code)}`)}">`,
  );
  const localeAlternates = LANDING_LANGUAGES.filter((code) => code !== language).map(
    (code) => `<meta property="og:locale:alternate" content="${OG_LOCALES[code]}">`,
  );
  return [
    `<title>${escapeHtml(copy.metaTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(copy.metaDescription)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    ...alternates,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${origin}${landingPath(ROOT_LANDING_LANGUAGE)}`)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Meeshy">',
    `<meta property="og:title" content="${escapeHtml(copy.metaTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(copy.metaDescription)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta property="og:image:type" content="image/png">',
    `<meta property="og:image:width" content="${OG_IMAGE_SIZE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_SIZE.height}">`,
    `<meta property="og:image:alt" content="${escapeHtml(copy.ogImageAlt)}">`,
    `<meta property="og:locale" content="${OG_LOCALES[language]}">`,
    ...localeAlternates,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(copy.metaTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(copy.metaDescription)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(copy.ogImageAlt)}">`,
    `<script type="application/ld+json">${inlineJson(landingStructuredData(language, origin))}</script>`,
  ].join('\n');
}

export function landingDocument(input: LandingDocumentInput): string {
  const { language, origin } = input;
  const copy = LANDING_COPY[language];
  const body = renderToStaticMarkup(<LandingPage language={language} copy={copy} />);
  const boot = input.bootScript ?? landingBootScript(landingBootConfig(language, input.boot));
  return `<!doctype html>
<html lang="${language}" dir="${landingDirection(language)}" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${landingHead(language, origin)}
<meta name="theme-color" content="${escapeHtml(input.themeColors.dark)}" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="${escapeHtml(input.themeColors.light)}" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<style>${input.sheet}</style>
<script>${input.schemeScript}</script>
<script>${boot}</script>
</head>
<body>${body}</body>
</html>
`;
}
