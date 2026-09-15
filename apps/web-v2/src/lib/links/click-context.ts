/**
 * **CE QU'UN CLIC SUR UN LIEN SUIVI RACONTE À LA PASSERELLE** (#6714).
 *
 * La page legacy (`apps/web/app/l/[token]/page.tsx`, `collectBrowserData`)
 * joignait ces champs à chaque clic, et les statistiques d'un lien les
 * agrègent (écran, fuseau, source sociale, UTM, visiteurs uniques). Les
 * porter À L'IDENTIQUE est ce qui empêche la bascule de casser les tableaux
 * du propriétaire d'un lien — à trois écarts près, chacun voulu :
 *
 * 1. **Navigateur, système et appareil ne partent plus.** La passerelle les
 *    détecte elle-même depuis l'en-tête `User-Agent`, que `fetch` porte
 *    toujours (`body.browser || detectBrowser(userAgent)`). Deux détecteurs
 *    pour une même valeur divergeaient déjà.
 * 2. **Chaque texte est borné** aux limites de `recordClickSchema`
 *    (`routes/tracking-links/types.ts`). Le legacy n'en bornait aucun : un
 *    référent de 3 000 caractères faisait refuser le clic ENTIER (400), et le
 *    clic n'était pas compté. Un nombre que la passerelle veut entier et qui
 *    ne l'est pas est omis, jamais arrondi.
 * 3. **La source sociale se lit sur le NOM D'HÔTE, jamais en sous-chaîne.**
 *    Le legacy cherchait `t.co` dans le référent : `pinterest.com` et
 *    `microsoft.com` le contiennent, et partaient en « Twitter/X ». Les
 *    LIBELLÉS restent ceux du legacy, pour que les agrégats continuent.
 *
 * **L'empreinte d'appareil est celle du legacy, octet pour octet** — mêmes
 * neuf valeurs, même ordre, même hachage sur les unités UTF-16. Une empreinte
 * qui changerait à la bascule compterait chaque appareil comme un visiteur
 * nouveau.
 *
 * `collectClickContext` est PURE : l'environnement entre en paramètre.
 * `browserClickEnvironment` est le seul site qui lit le navigateur.
 */

const TEXT_BOUNDS = {
  referrer: 2048,
  language: 35,
  languages: 256,
  deviceFingerprint: 128,
  screenResolution: 20,
  viewportSize: 20,
  timezone: 64,
  connectionType: 32,
  platform: 64,
  socialSource: 100,
  utmClickSource: 100,
  utmClickMedium: 100,
  utmClickCampaign: 100,
  utmClickTerm: 100,
  utmClickContent: 100,
} as const;

type TextField = keyof typeof TEXT_BOUNDS;

const TEXT_FIELDS = Object.freeze(Object.keys(TEXT_BOUNDS)) as readonly TextField[];

const INTEGER_FIELDS = ['colorDepth', 'hardwareConcurrency'] as const;
const DECIMAL_FIELDS = ['pixelRatio', 'connectionSpeed', 'deviceMemory'] as const;

type IntegerField = (typeof INTEGER_FIELDS)[number];
type DecimalField = (typeof DECIMAL_FIELDS)[number];

export type ClickContext = Readonly<
  Partial<Record<TextField, string> & Record<IntegerField | DecimalField, number> & Record<'touchSupport' | 'cookiesEnabled', boolean>>
>;

export type ClickEnvironment = {
  readonly userAgent: string;
  readonly referrer: string;
  readonly search: string;
  readonly language: string;
  readonly languages: readonly string[];
  readonly screen: { readonly width: number; readonly height: number; readonly colorDepth: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly pixelRatio: number;
  readonly timezone: string;
  readonly maxTouchPoints: number;
  readonly platform: string;
  readonly cookiesEnabled: boolean;
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
  readonly connection?: { readonly effectiveType?: string; readonly type?: string; readonly downlink?: number };
};

const texts = (values: { readonly [K in TextField]?: string | undefined }): Partial<Record<TextField, string>> =>
  TEXT_FIELDS.reduce<Partial<Record<TextField, string>>>((kept, field) => {
    const value = values[field]?.trim() ?? '';
    return value === '' ? kept : { ...kept, [field]: value.slice(0, TEXT_BOUNDS[field]) };
  }, {});

function numbers<F extends IntegerField | DecimalField>(
  fields: readonly F[],
  values: { readonly [K in F]?: number | undefined },
  accept: (value: number) => boolean,
): Partial<Record<F, number>> {
  return fields.reduce<Partial<Record<F, number>>>((kept, field) => {
    const value = values[field];
    return value === undefined || !accept(value) ? kept : { ...kept, [field]: value };
  }, {});
}

const REFERRER_SOURCES: ReadonlyArray<readonly [label: string, domains: readonly string[]]> = [
  ['WhatsApp', ['whatsapp.com', 'wa.me', 'l.wl.co']],
  ['Telegram', ['t.me', 'telegram.org', 'telegram.me']],
  ['Facebook', ['facebook.com', 'fb.com']],
  ['Messenger', ['messenger.com']],
  ['Instagram', ['instagram.com']],
  ['Twitter/X', ['t.co', 'twitter.com', 'x.com']],
  ['LinkedIn', ['linkedin.com', 'lnkd.in']],
  ['Reddit', ['reddit.com', 'redd.it']],
  ['TikTok', ['tiktok.com']],
  ['Discord', ['discord.com', 'discordapp.com']],
  ['Slack', ['slack.com', 'slack-redir.net']],
  ['Snapchat', ['snapchat.com']],
  ['Pinterest', ['pinterest.com', 'pin.it']],
  ['YouTube', ['youtube.com', 'youtu.be']],
  ['Email', ['mail.google.com', 'mail.yahoo.com', 'outlook.live.com', 'outlook.office.com']],
  ['Bing', ['bing.com']],
  ['DuckDuckGo', ['duckduckgo.com']],
];

const USER_AGENT_SOURCES: ReadonlyArray<readonly [label: string, needles: readonly string[]]> = [
  ['Facebook', ['fban', 'fbav', 'fb_iab']],
  ['Instagram', ['instagram']],
  ['Twitter/X', ['twitter']],
  ['LinkedIn', ['linkedinapp']],
  ['Snapchat', ['snapchat']],
  ['TikTok', ['bytedance', 'tiktok']],
  ['LINE', ['line/']],
  ['KakaoTalk', ['kakaotalk']],
  ['Weibo', ['weibo']],
  ['WeChat', ['micromessenger']],
];

const parsedUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const belongsTo = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

const isGoogleSearch = (url: URL): boolean =>
  /(^|\.)google\.[a-z.]+$/.test(url.hostname) && (url.pathname.startsWith('/search') || url.searchParams.has('q'));

function sourceOfReferrer(url: URL): string | null {
  const listed = REFERRER_SOURCES.find(([, domains]) => domains.some((domain) => belongsTo(url.hostname, domain)));
  if (listed !== undefined) return listed[0];
  return isGoogleSearch(url) ? 'Google Search' : null;
}

export function detectSocialSource(referrer: string, userAgent: string): string {
  const url = referrer === '' ? null : parsedUrl(referrer);
  const byReferrer = url === null ? null : sourceOfReferrer(url);
  if (byReferrer !== null) return byReferrer;

  const agent = userAgent.toLowerCase();
  const byAgent = USER_AGENT_SOURCES.find(([, needles]) => needles.some((needle) => agent.includes(needle)));
  if (byAgent !== undefined) return byAgent[0];

  return referrer === '' ? 'Direct' : 'Other';
}

/** L'algorithme de `collectBrowserData` (legacy), à l'identique. */
function legacyFingerprint(env: ClickEnvironment): string {
  const data = [
    env.userAgent,
    env.screen.width,
    env.screen.height,
    env.screen.colorDepth,
    env.pixelRatio,
    env.language,
    env.platform,
    env.hardwareConcurrency,
    env.timezone,
  ].join('|');
  const hash = Array.from({ length: data.length }, (_, index) => data.charCodeAt(index)).reduce(
    (acc, code) => ((acc << 5) - acc + code) | 0,
    0,
  );
  return `fp-${Math.abs(hash).toString(36)}`;
}

export function collectClickContext(env: ClickEnvironment): ClickContext {
  const utm = new URLSearchParams(env.search);
  const fromUtm = (name: string): string | undefined => utm.get(name) ?? undefined;
  return {
    ...texts({
      referrer: env.referrer,
      language: env.language.split('-')[0] || 'en',
      languages: (env.languages.length > 0 ? env.languages : [env.language]).join(','),
      deviceFingerprint: legacyFingerprint(env),
      screenResolution: `${env.screen.width}x${env.screen.height}`,
      viewportSize: `${env.viewport.width}x${env.viewport.height}`,
      timezone: env.timezone,
      connectionType: env.connection?.effectiveType ?? env.connection?.type,
      platform: env.platform,
      socialSource: detectSocialSource(env.referrer, env.userAgent),
      utmClickSource: fromUtm('utm_source'),
      utmClickMedium: fromUtm('utm_medium'),
      utmClickCampaign: fromUtm('utm_campaign'),
      utmClickTerm: fromUtm('utm_term'),
      utmClickContent: fromUtm('utm_content'),
    }),
    ...numbers(INTEGER_FIELDS, { colorDepth: env.screen.colorDepth, hardwareConcurrency: env.hardwareConcurrency }, Number.isInteger),
    ...numbers(
      DECIMAL_FIELDS,
      { pixelRatio: env.pixelRatio, connectionSpeed: env.connection?.downlink, deviceMemory: env.deviceMemory },
      Number.isFinite,
    ),
    touchSupport: env.maxTouchPoints > 0,
    cookiesEnabled: env.cookiesEnabled,
  };
}

const positiveNumber = (raw: unknown): number | undefined => (typeof raw === 'number' && raw > 0 ? raw : undefined);
const nonEmptyText = (raw: unknown): string | undefined => (typeof raw === 'string' && raw !== '' ? raw : undefined);

/** `navigator.connection` n'existe que sous Chromium, et le DOM de TypeScript ne le déclare pas. */
function readConnection(raw: unknown): ClickEnvironment['connection'] {
  if (raw === null || typeof raw !== 'object') return undefined;
  const effectiveType = nonEmptyText(Reflect.get(raw, 'effectiveType'));
  const type = nonEmptyText(Reflect.get(raw, 'type'));
  const downlink = positiveNumber(Reflect.get(raw, 'downlink'));
  return {
    ...(effectiveType === undefined ? {} : { effectiveType }),
    ...(type === undefined ? {} : { type }),
    ...(downlink === undefined ? {} : { downlink }),
  };
}

export function browserClickEnvironment(): ClickEnvironment {
  const hardwareConcurrency = positiveNumber(navigator.hardwareConcurrency);
  const deviceMemory = positiveNumber(Reflect.get(navigator, 'deviceMemory'));
  const connection = readConnection(Reflect.get(navigator, 'connection'));
  return {
    userAgent: navigator.userAgent,
    referrer: document.referrer,
    search: window.location.search,
    language: navigator.language ?? '',
    languages: navigator.languages ?? [],
    screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth || 24 },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    pixelRatio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform ?? '',
    cookiesEnabled: navigator.cookieEnabled,
    ...(hardwareConcurrency === undefined ? {} : { hardwareConcurrency }),
    ...(deviceMemory === undefined ? {} : { deviceMemory }),
    ...(connection === undefined ? {} : { connection }),
  };
}
