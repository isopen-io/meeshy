/**
 * L'ATLAS DES LANGUES (#9388) — le passeport des langues vraiment échangées.
 * `docs/product/jeu-meeshy-conception.html` § II.8.
 *
 * Une langue est TAMPONNÉE quand un message est envoyé ET un reçu avec quelqu'un
 * qui l'écrit. La langue d'un événement est celle de la PERSONNE d'en face :
 *
 *  - `received` : la langue d'ORIGINE du message reçu — celle que son auteur écrit ;
 *  - `sent` : la langue que le destinataire écrit, que la passerelle connaît (la
 *    langue d'origine de ses messages, à défaut sa langue système).
 *
 * La passerelle n'envoie un événement que pour un échange réel — jamais un
 * message à soi-même, à un compte de moins de 24 h ou bloqué (partie IX). La
 * loi, elle, ne voit que des langues et des jours.
 *
 * Le catalogue n'est PAS une liste de plus : c'est la source unique des langues
 * servies (`SUPPORTED_LANGUAGE_CODES`, `language-codes.ts`), et `atlasLanguage`
 * range tout code verbatim (`en-US`, `pt_BR`) sous sa langue servie par
 * `normalizeLanguageCode` — sans jamais tronquer un code à 3 lettres en une autre
 * langue. Un code hors catalogue n'inscrit rien.
 */

import { SUPPORTED_LANGUAGE_CODES } from '../language-codes.js';
import { normalizeLanguageCode } from '../language-normalize.js';

export const ATLAS_TOTAL = SUPPORTED_LANGUAGE_CODES.length;

const CATALOG: ReadonlySet<string> = new Set(SUPPORTED_LANGUAGE_CODES);
const CATALOG_ORDER: ReadonlyMap<string, number> = new Map(SUPPORTED_LANGUAGE_CODES.map((code, index) => [code, index]));

/** La langue servie d'un code, `null` hors du catalogue. */
export function atlasLanguage(code: string | null | undefined): string | null {
  const normalized = normalizeLanguageCode(code);
  return normalized !== undefined && CATALOG.has(normalized) ? normalized : null;
}

export type AtlasEntry = {
  readonly sent: boolean;
  readonly received: boolean;
  /** Le jour où le tampon s'est posé, `null` tant qu'il manque un sens. */
  readonly stampedOn: string | null;
};

export type AtlasState = Readonly<Record<string, AtlasEntry>>;

export type AtlasEvent = { readonly kind: 'sent' | 'received'; readonly language: string };

export type AtlasStep = {
  readonly state: AtlasState;
  /** La langue qui vient d'être tamponnée, `null` sinon. */
  readonly stamped: string | null;
};

export function applyAtlasEvent(params: {
  readonly state: AtlasState;
  readonly event: AtlasEvent;
  readonly dayKey: string;
}): AtlasStep {
  const language = atlasLanguage(params.event.language);
  if (language === null) return { state: params.state, stamped: null };

  const before: AtlasEntry = params.state[language] ?? { sent: false, received: false, stampedOn: null };
  const sent = before.sent || params.event.kind === 'sent';
  const received = before.received || params.event.kind === 'received';
  const justStamped = before.stampedOn === null && sent && received;
  const entry: AtlasEntry = { sent, received, stampedOn: justStamped ? params.dayKey : before.stampedOn };
  return { state: { ...params.state, [language]: entry }, stamped: justStamped ? language : null };
}

/** Rejoue une suite d'événements datés. */
export const foldAtlas = (params: {
  readonly state: AtlasState;
  readonly events: readonly (AtlasEvent & { readonly dayKey: string })[];
}): AtlasState =>
  params.events.reduce((state, event) => applyAtlasEvent({ state, event, dayKey: event.dayKey }).state, params.state);

export type AtlasSummary = {
  readonly stamped: number;
  readonly total: number;
  readonly remaining: number;
  /** Du plus ancien au plus récent ; à jour égal, dans l'ordre du catalogue. */
  readonly stamps: readonly { readonly language: string; readonly stampedOn: string }[];
  /** Les échanges à moitié faits : un sens manque encore. */
  readonly pending: readonly { readonly language: string; readonly sent: boolean; readonly received: boolean }[];
};

const catalogIndex = (language: string): number => CATALOG_ORDER.get(language) ?? Number.MAX_SAFE_INTEGER;

export function atlasSummary(state: AtlasState): AtlasSummary {
  const entries = Object.entries(state).sort(([a], [b]) => catalogIndex(a) - catalogIndex(b));
  const stamps = entries
    .flatMap(([language, entry]) => (entry.stampedOn === null ? [] : [{ language, stampedOn: entry.stampedOn }]))
    .sort((a, b) => (a.stampedOn === b.stampedOn ? catalogIndex(a.language) - catalogIndex(b.language) : a.stampedOn < b.stampedOn ? -1 : 1));
  const pending = entries.flatMap(([language, entry]) =>
    entry.stampedOn === null ? [{ language, sent: entry.sent, received: entry.received }] : [],
  );
  return { stamped: stamps.length, total: ATLAS_TOTAL, remaining: ATLAS_TOTAL - stamps.length, stamps, pending };
}
