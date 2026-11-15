import { LANDING_LANGUAGES, OG_LOCALES, ROOT_LANDING_LANGUAGE, type LandingLanguage } from '@/landing/landing-languages';
import { LANDING_COPY } from '@/landing/landing-copy';
import { OG_IMAGE_SIZE, landingOgImagePath } from '@/landing/landing-document';

import { SHARE_PREVIEW_COPY, type SharePreviewFamily } from './share-preview-copy';

export type { SharePreviewFamily } from './share-preview-copy';

/**
 * L'APERÇU D'UNE ADRESSE DE L'APPLICATION (#10192) — ce qu'un robot de
 * messagerie lit quand on colle `https://meeshy.me/<adresse>`.
 *
 * Un robot d'aperçu n'exécute pas de JavaScript : ce que l'application pose
 * dans le `<head>` après démarrage ne l'atteint pas. La construction écrit donc
 * une COPIE de la coquille par famille d'adresse et par langue
 * (`scripts/prerender-share-previews.ts`), identique à `index.html` octet pour
 * octet hormis son titre, sa description et ses balises Open Graph / Twitter ;
 * nginx la sert aux ROBOTS D'APERÇU à la place de `index.html` sur les adresses
 * de l'application (`location @app`), la famille lue sur le chemin, la langue
 * sur l'en-tête. Un navigateur reçoit `index.html`, inchangée.
 *
 * LA RÈGLE DE SÉCURITÉ EST STRUCTURELLE : la copie est écrite au BUILD, sans
 * connaître aucune adresse réelle. Elle ne PEUT rien dire d'une conversation,
 * d'un lien ou d'un membre — pas même son identifiant : une famille dynamique
 * ne porte pas d'`og:url` (le robot garde l'adresse qu'il a demandée). Ce qui
 * dépend d'une donnée — le titre d'une invitation ouverte, la cible d'un lien
 * suivi — se rend côté PASSERELLE, aux robots seuls (routeurs Traefik
 * `*-unfurl`, décision D-199).
 */

/** Les adresses de chaque famille — l'ordre est celui de nginx, la première qui répond gagne. */
export const SHARE_PREVIEW_ROUTES: readonly { readonly family: Exclude<SharePreviewFamily, 'app'>; readonly pattern: string }[] = [
  { family: 'world', pattern: '^/world/?$' },
  { family: 'login', pattern: '^/login(/|$)' },
  { family: 'signup', pattern: '^/signup(/|$)' },
  { family: 'conversation', pattern: '^/c/' },
  { family: 'invitation', pattern: '^/chat/' },
  { family: 'link', pattern: '^/l/' },
];

export const SHARE_PREVIEW_FAMILIES: readonly SharePreviewFamily[] = [...SHARE_PREVIEW_ROUTES.map((route) => route.family), 'app'];

/** Les familles FIXES : une seule page derrière l'adresse, qui peut donc se nommer (`og:url`). */
const FIXED_FAMILY_PATHS: Readonly<Partial<Record<SharePreviewFamily, string>>> = {
  world: '/world',
  login: '/login',
  signup: '/signup',
};

export function sharePreviewFamily(path: string): SharePreviewFamily {
  return SHARE_PREVIEW_ROUTES.find((route) => new RegExp(route.pattern).test(path))?.family ?? 'app';
}

/**
 * LA LANGUE DE L'APERÇU, lue sur la requête du robot — la règle de nginx
 * (`map … $meeshy_og_lang`), rendue ici en fonction pour son témoin.
 *
 * 1. `X-Facebook-Locale` (`fr_FR`…), que Facebook envoie quand la page déclare
 *    ses `og:locale:alternate` ;
 * 2. sinon la PREMIÈRE langue de `Accept-Language` — nginx ne pèse pas les
 *    `q=` : un robot n'en annonce qu'une ;
 * 3. sinon le français, langue de la racine (`x-default`).
 */
export const SHARE_PREVIEW_LANGUAGE_RULES: readonly { readonly pattern: string; readonly language: LandingLanguage }[] = [
  ...LANDING_LANGUAGES.map((language) => ({ pattern: `^${language}_`, language })),
  ...LANDING_LANGUAGES.filter((language) => language !== ROOT_LANDING_LANGUAGE).map((language) => ({
    pattern: `^[^|]*[|]${language}(?![a-z])`,
    language,
  })),
];

export function sharePreviewLanguage(headers: { readonly facebookLocale?: string; readonly acceptLanguage?: string }): LandingLanguage {
  const key = `${headers.facebookLocale ?? ''}|${headers.acceptLanguage ?? ''}`;
  return SHARE_PREVIEW_LANGUAGE_RULES.find((rule) => new RegExp(rule.pattern, 'i').test(key))?.language ?? ROOT_LANDING_LANGUAGE;
}

/**
 * LES ROBOTS D'APERÇU — eux seuls reçoivent la copie (`map … $meeshy_preview_bot`) ;
 * un navigateur reçoit `index.html` inchangée. La liste est celle des routeurs
 * Traefik `*-unfurl` (#9712), confrontée à eux par le témoin : elle ne nomme que
 * des agents qui ne sont pas des navigateurs, si bien qu'un humain dans le
 * navigateur intégré d'une application (Facebook, Instagram) reçoit l'application.
 */
export const SHARE_PREVIEW_BOT_AGENTS = 'facebookexternalhit|facebot|whatsapp|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|embedly|iframely|redditbot|pinterestbot|vkshare|mastodon|bluesky|cardyb|google-pagerenderer|kakaotalk-scrap|bitlybot|mattermost|synapse';

export function isSharePreviewBot(userAgent: string): boolean {
  return new RegExp(`(${SHARE_PREVIEW_BOT_AGENTS})`, 'i').test(userAgent);
}

/** L'image de marque, 1200 × 630, la même pour toutes les langues — celle de l'invitation (#9712). */
export const BRAND_OG_IMAGE_PATH = '/og/invitation-v1.png';

/** Le répertoire des copies dans le dist, et le fichier d'une famille dans une langue. */
export const SHARE_PREVIEW_DIR = 'shell-og';

export function sharePreviewFile(family: SharePreviewFamily, language: LandingLanguage): string {
  return `${SHARE_PREVIEW_DIR}/${family}/${language}.html`;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function image(family: SharePreviewFamily, language: LandingLanguage): { readonly path: string; readonly alt: string } {
  return family === 'world'
    ? { path: landingOgImagePath(language), alt: LANDING_COPY[language].ogImageAlt }
    : { path: BRAND_OG_IMAGE_PATH, alt: SHARE_PREVIEW_COPY[language].brandImageAlt };
}

export function sharePreviewHead(input: { readonly family: SharePreviewFamily; readonly language: LandingLanguage; readonly origin: string }): string {
  const { family, language, origin } = input;
  const { title, description } = SHARE_PREVIEW_COPY[language][family];
  const picture = image(family, language);
  const imageUrl = `${origin}${picture.path}`;
  const fixedPath = FIXED_FAMILY_PATHS[family];
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Meeshy">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    ...(fixedPath === undefined ? [] : [`<meta property="og:url" content="${escapeHtml(`${origin}${fixedPath}`)}">`]),
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    '<meta property="og:image:type" content="image/png">',
    `<meta property="og:image:width" content="${OG_IMAGE_SIZE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_SIZE.height}">`,
    `<meta property="og:image:alt" content="${escapeHtml(picture.alt)}">`,
    `<meta property="og:locale" content="${OG_LOCALES[language]}">`,
    ...LANDING_LANGUAGES.filter((code) => code !== language).map((code) => `<meta property="og:locale:alternate" content="${OG_LOCALES[code]}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(picture.alt)}">`,
  ].join('\n    ');
}

/** Ce que la coquille construite porte, et que la copie remplace — rien d'autre ne bouge. */
export const SHELL_TITLE = '<title>Meeshy</title>';
const SHELL_DESCRIPTION = /\n\s*<meta name="description" content="[^"]*"\s*\/?>/;

export function sharePreviewShell(shell: string, input: { readonly family: SharePreviewFamily; readonly language: LandingLanguage; readonly origin: string }): string {
  if (!shell.includes(SHELL_TITLE) || !SHELL_DESCRIPTION.test(shell)) {
    throw new Error('La coquille ne porte pas `<title>Meeshy</title>` et sa description : l’aperçu n’a rien à remplacer.');
  }
  return shell.replace(SHELL_DESCRIPTION, '').replace(SHELL_TITLE, sharePreviewHead(input));
}
