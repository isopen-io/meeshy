import { DOCUMENT_LANGUAGE } from '@/app/document-language';

/**
 * Ce que le SERVEUR sait du visiteur, lu dans ses en-têtes — et rien d'autre.
 *
 * `apps/web/app/l/[token]/page.tsx` fait 550 lignes `'use client'` pour
 * répondre aux mêmes questions : il faut d'abord charger un framework, puis
 * hydrater, puis interroger `navigator`, puis poster, puis résoudre, puis
 * rediriger. Tout ce qui est ici est déjà dans la requête. Ce qui n'y est PAS —
 * résolution d'écran, fuseau, empreinte, mémoire — est précisément ce que le
 * § 2 renvoie au `sendBeacon` d'APRÈS : ces champs n'existent que dans un
 * navigateur, et les attendre coûterait au lecteur le voyage entier.
 *
 * `estUnRobot` est la seule décision de ce module qui change la RÉPONSE : un
 * robot d'aperçu reçoit le repli HTML porteur des OG (il ne suivrait de toute
 * façon pas la 302 pour en composer une carte), un humain reçoit la 302. Le
 * doute profite à l'humain : sans user-agent, on redirige — c'est le chemin
 * nominal, et le seul qui soit gratuit.
 */

const ROBOTS: readonly string[] = [
  'facebookexternalhit',
  'facebookcatalog',
  'whatsapp',
  'twitterbot',
  'slackbot',
  'slack-imgproxy',
  'telegrambot',
  'linkedinbot',
  'discordbot',
  'redditbot',
  'pinterest',
  'skypeuripreview',
  'applebot',
  'googlebot',
  'google-inspectiontool',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'baiduspider',
  'embedly',
  'quora link preview',
  'vkshare',
  'nuzzel',
  'outbrain',
  'iframely',
  'mastodon',
  'signal-desktop',
  'viber',
  'developers.google.com/+/web/snippet',
];

/**
 * Le filet : tout ce qui se déclare robot sans figurer dans la liste ci-dessus.
 *
 * Pas de `\b` en TÊTE, et c'est le point : les agents composent leur nom
 * (`SomeNewCrawler/1.0`), donc la frontière de mot n'existe qu'à la FIN. Un
 * `\b` initial faisait retomber tout robot inconnu dans le chemin humain — un
 * aperçu vide, exactement le défaut que ce lot corrige.
 */
const ROBOT_GENERIQUE = /(?:bot|crawler|spider|preview|scraper)\b/i;

const SOURCE_PAR_REFERRER: readonly (readonly [readonly string[], string])[] = [
  [['whatsapp.com', 'wa.me', 'l.wl.co'], 'WhatsApp'],
  [['t.me', 'telegram.org', 'telegram.me'], 'Telegram'],
  [['messenger.com'], 'Messenger'],
  [['facebook.com', 'fb.com'], 'Facebook'],
  [['instagram.com'], 'Instagram'],
  [['t.co', 'twitter.com', 'x.com'], 'Twitter/X'],
  [['linkedin.com', 'lnkd.in'], 'LinkedIn'],
  [['reddit.com', 'redd.it'], 'Reddit'],
  [['tiktok.com'], 'TikTok'],
  [['discord.com', 'discordapp.com'], 'Discord'],
  [['slack.com', 'slack-redir.net'], 'Slack'],
  [['snapchat.com'], 'Snapchat'],
  [['pinterest.com', 'pin.it'], 'Pinterest'],
  [['youtube.com', 'youtu.be'], 'YouTube'],
  [['mail.google.com', 'mail.yahoo.com', 'outlook.live.com', 'outlook.office.com'], 'Email'],
  [['bing.com'], 'Bing'],
  [['duckduckgo.com'], 'DuckDuckGo'],
];

const SOURCE_PAR_AGENT: readonly (readonly [readonly string[], string])[] = [
  [['whatsapp'], 'WhatsApp'],
  [['fban', 'fbav', 'fb_iab'], 'Facebook'],
  [['instagram'], 'Instagram'],
  [['twitter'], 'Twitter/X'],
  [['linkedinapp'], 'LinkedIn'],
  [['snapchat'], 'Snapchat'],
  [['bytedance', 'tiktok'], 'TikTok'],
  [['line/'], 'LINE'],
  [['kakaotalk'], 'KakaoTalk'],
  [['micromessenger'], 'WeChat'],
];

const NAVIGATEURS: readonly (readonly [RegExp, string])[] = [
  [/\bfirefox\b/, 'Firefox'],
  [/samsungbrowser/, 'Samsung Internet'],
  [/\b(?:opera|opr)\b/, 'Opera'],
  [/\bedg/, 'Edge'],
  [/\bchrome\b/, 'Chrome'],
  [/\bsafari\b/, 'Safari'],
];

const SYSTEMES: readonly (readonly [RegExp, string])[] = [
  [/iphone|ipad|ipod/, 'iOS'],
  [/android/, 'Android'],
  [/windows/, 'Windows'],
  [/mac os x|macintosh/, 'macOS'],
  [/cros/, 'ChromeOS'],
  [/linux/, 'Linux'],
];

const UTM: Readonly<Record<string, string>> = {
  utm_source: 'utmClickSource',
  utm_medium: 'utmClickMedium',
  utm_campaign: 'utmClickCampaign',
  utm_term: 'utmClickTerm',
  utm_content: 'utmClickContent',
};

/** Ce qu'un agent qui ne se décrit pas — un robot d'aperçu, typiquement — rend. */
export const INCONNU = 'Inconnu';

export type Appareil = {
  readonly os: string;
  readonly navigateur: string;
  readonly type: 'mobile' | 'tablet' | 'desktop';
};

export type LangueDemandee = {
  /** L'étiquette BCP-47 telle que l'agent la demande — `fr-FR`, `en`. */
  readonly etiquette: string;
  /** La liste complète, transmise telle quelle à la télémétrie. */
  readonly liste: string | null;
  /** Le nom de la langue, dans la langue du document. */
  readonly libelle: string;
  /** Le drapeau de la RÉGION, quand l'étiquette en porte une — jamais déduit d'une langue. */
  readonly drapeau: string | null;
};

export type Visiteur = {
  readonly estUnRobot: boolean;
  readonly source: string;
  readonly appareil: Appareil;
  readonly langue: LangueDemandee;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly referrer: string | null;
  readonly utm: Readonly<Record<string, string>>;
};

const texte = (valeur: string | null): string | null =>
  valeur !== null && valeur.trim() !== '' ? valeur : null;

const premier = <T,>(table: readonly (readonly [readonly string[], T])[], aiguille: string): T | null =>
  table.find(([marqueurs]) => marqueurs.some((marqueur) => aiguille.includes(marqueur)))?.[1] ?? null;

const parMotif = (table: readonly (readonly [RegExp, string])[], aiguille: string, defaut: string): string =>
  table.find(([motif]) => motif.test(aiguille))?.[1] ?? defaut;

const estUnRobot = (agent: string): boolean =>
  ROBOTS.some((robot) => agent.includes(robot)) || ROBOT_GENERIQUE.test(agent);

const typeDAppareil = (agent: string): Appareil['type'] => {
  if (/ipad|tablet|(?=.*android)(?!.*mobile)/.test(agent)) return 'tablet';
  if (/mobile|iphone|ipod/.test(agent)) return 'mobile';
  return 'desktop';
};

/**
 * `Chrome` avant `Safari` dans la table, parce que tout navigateur WebKit
 * annonce `Safari` : l'ordre EST la règle, et l'écrire en table le rend
 * relisible là où une cascade de `if` le cachait.
 */
const appareilDe = (agent: string): Appareil => ({
  os: parMotif(SYSTEMES, agent, INCONNU),
  navigateur: parMotif(NAVIGATEURS, agent, INCONNU),
  type: typeDAppareil(agent),
});

const DRAPEAU = /^[a-z]{2,3}-([a-z]{2})$/;

const drapeauDe = (etiquette: string): string | null => {
  const region = DRAPEAU.exec(etiquette.toLowerCase())?.[1];
  if (region === undefined) return null;
  return [...region.toUpperCase()]
    .map((lettre) => String.fromCodePoint(0x1f1e6 + lettre.charCodeAt(0) - 65))
    .join('');
};

const libelleDe = (etiquette: string): string => {
  const base = etiquette.split('-')[0] ?? etiquette;
  try {
    const nom = new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'language' }).of(base) ?? base;
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  } catch {
    return base;
  }
};

const ETIQUETTE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const langueDemandee = (acceptLanguage: string | null): LangueDemandee => {
  const premiere = acceptLanguage?.split(',')[0]?.split(';')[0]?.trim() ?? '';
  const etiquette = ETIQUETTE.test(premiere) ? premiere : DOCUMENT_LANGUAGE;

  return {
    etiquette,
    liste: acceptLanguage,
    libelle: libelleDe(etiquette),
    drapeau: drapeauDe(etiquette),
  };
};

export const lisLeVisiteur = ({
  entetes,
  url,
}: {
  readonly entetes: Headers;
  readonly url: URL;
}): Visiteur => {
  const userAgent = texte(entetes.get('user-agent'));
  const referrer = texte(entetes.get('referer'));
  const agent = (userAgent ?? '').toLowerCase();
  const reference = (referrer ?? '').toLowerCase();

  return {
    estUnRobot: userAgent !== null && estUnRobot(agent),
    source: premier(SOURCE_PAR_REFERRER, reference) ?? premier(SOURCE_PAR_AGENT, agent) ?? 'Direct',
    appareil: appareilDe(agent),
    langue: langueDemandee(texte(entetes.get('accept-language'))),
    ip: texte(entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ?? entetes.get('x-real-ip')),
    userAgent,
    referrer,
    utm: Object.fromEntries(
      Object.entries(UTM).flatMap(([parametre, champ]) => {
        const valeur = texte(url.searchParams.get(parametre));
        return valeur === null ? [] : [[champ, valeur] as const];
      }),
    ),
  };
};
