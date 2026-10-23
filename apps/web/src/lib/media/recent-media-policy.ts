/**
 * LE SEAU DES MÉDIAS VUS RÉCEMMENT (#11326, défaut retenu de #11253) — ce qui
 * y entre, ce qui en sort. Pur : la garde (`recent-media-store.ts`) et le
 * worker (`public/sw-recent-media.js`, son JUMEAU classique) le consomment.
 *
 * Un `<video>` demande d'emblée une PLAGE, et une `206` ne se resert pas
 * seule : le seau garde le fichier ENTIER, téléchargé à part par la page, et
 * le worker y découpe les plages. Le défaut du porteur : trois jours, Wi-Fi
 * seulement, cinq cents mégaoctets.
 */
export const RECENT_MEDIA_POLICY = {
  maxAgeMs: 3 * 24 * 60 * 60 * 1000,
  budgetBytes: 500 * 1024 * 1024,
} as const;

/** La date d'écriture, posée par la garde sur la réponse rangée — le worker et l'éviction la lisent. */
export const RECENT_MEDIA_STORED_AT_HEADER = 'X-Meeshy-Stored-At';

/**
 * `protected` — vue unique, flouté, éphémère, chiffré : la surface qui SAIT le
 * déclare. Le défaut d'une surface qui ne sait pas est de ne rien demander.
 */
export type RecentMediaProtection = 'none' | 'protected';

/** `navigator.connection` (Network Information API) — absent sur Safari et Firefox. */
export type RecentMediaConnection = { readonly type?: string; readonly saveData?: boolean } | undefined;

export type RecentMediaRefusal = 'protected' | 'not-http' | 'signed-url' | 'not-wifi' | 'save-data';

const UNMETERED = new Set(['wifi', 'ethernet']);

/** `URL.canParse` n'existe qu'à partir de Chrome 120 — la coque en tolère 111. */
const parsed = (src: string): URL | null => {
  try {
    return new URL(src);
  } catch {
    return null;
  }
};

/**
 * Une adresse à paramètres n'est JAMAIS gardée : la route signée par lecteur
 * (#9600) en portera la signature et l'échéance — garder ses octets trois
 * jours survivrait à l'échéance du lecteur. Les routes de fichiers servies
 * aujourd'hui n'en portent aucun.
 */
export function recentMediaAdmission({
  src,
  protection,
  connection,
}: {
  readonly src: string;
  readonly protection: RecentMediaProtection;
  readonly connection: RecentMediaConnection;
}): { readonly admit: true } | { readonly admit: false; readonly reason: RecentMediaRefusal } {
  if (protection !== 'none') return { admit: false, reason: 'protected' };
  const url = parsed(src);
  if (url === null || (url.protocol !== 'https:' && url.protocol !== 'http:')) return { admit: false, reason: 'not-http' };
  if (url.search !== '') return { admit: false, reason: 'signed-url' };
  if (connection?.saveData === true) return { admit: false, reason: 'save-data' };
  if (connection?.type === undefined || !UNMETERED.has(connection.type)) return { admit: false, reason: 'not-wifi' };
  return { admit: true };
}

const NO_STORE_OR_NO_CACHE = /(?:^|,)\s*no-(?:store|cache)\s*(?:[,=]|$)/i;

/** Seul le fichier ENTIER (`200`) sert les plages ; ce que la passerelle déclare non gardable ne l'est pas (#9478). */
export function recentMediaResponseAdmission({
  status,
  cacheControl,
  contentLength,
}: {
  readonly status: number;
  readonly cacheControl: string;
  readonly contentLength: number | null;
}): boolean {
  if (status !== 200 || NO_STORE_OR_NO_CACHE.test(cacheControl)) return false;
  return contentLength !== null && contentLength > 0 && contentLength <= RECENT_MEDIA_POLICY.budgetBytes;
}

export type RecentMediaEntry = { readonly url: string; readonly storedAt: number; readonly bytes: number };

/**
 * Ce qui sort avant d'écrire `incomingBytes` : l'expiré (ou l'illisible),
 * puis le plus ANCIEN jusqu'à tenir dans le budget — rien de plus.
 */
export function recentMediaEvictions({
  entries,
  now,
  incomingBytes,
}: {
  readonly entries: readonly RecentMediaEntry[];
  readonly now: number;
  readonly incomingBytes: number;
}): readonly string[] {
  const alive = (entry: RecentMediaEntry): boolean => Number.isFinite(entry.storedAt) && now - entry.storedAt <= RECENT_MEDIA_POLICY.maxAgeMs;
  const expired = entries.filter((entry) => !alive(entry)).map((entry) => entry.url);
  const oldestFirst = entries.filter(alive).toSorted((a, b) => a.storedAt - b.storedAt);
  const total = oldestFirst.reduce((sum, entry) => sum + entry.bytes, incomingBytes);
  const { evicted } = oldestFirst.reduce<{ readonly evicted: readonly string[]; readonly total: number }>(
    (acc, entry) => (acc.total <= RECENT_MEDIA_POLICY.budgetBytes ? acc : { evicted: [...acc.evicted, entry.url], total: acc.total - entry.bytes }),
    { evicted: [], total },
  );
  return [...expired, ...evicted];
}
