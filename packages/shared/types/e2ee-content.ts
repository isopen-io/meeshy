/**
 * LE CONTRAT DE CE QUE LIBSIGNAL CHIFFRE DANS UNE CONVERSATION E2EE (#18940).
 *
 * libsignal ne chiffre pas un texte nu mais un JSON applicatif, écrit et lu à
 * l'octet près par iOS, Android et le web :
 * - le CONTENU d'un message (`E2EEContent` v1, version sous la clé `v`) ;
 * - un SIGNAL (`E2EESignal` v1, version sous la clé `s`) : réaction, frappe,
 *   accusé, progression de lecture, modification, suppression pour tous, vue
 *   unique ouverte, épinglage (#13142) ;
 * - suivi d'ESPACES `0x20` jusqu'au palier (`e2eePaddedLength`,
 *   `types/e2ee-signals.ts`) : un JSON suivi d'espaces reste un JSON valide.
 *
 * Ce module en est la déclaration UNIQUE côté TypeScript, FIDÈLE à ce que
 * l'iPhone produit et accepte aujourd'hui — chaque règle cite son site :
 * - Swift : `packages/MeeshySDK/Sources/MeeshyE2EE/E2EEContent.swift:9-104`
 *   (contenu, encodeur `.sortedKeys` + `.withoutEscapingSlashes`, auteur,
 *   conversation), `E2EESignal.swift:97-204` (signal), `:206-218` (sonde
 *   message/signal), `:226-266` (remplissage), `E2EEMessageSealer.swift:80-101`
 *   (le scelleur signe l'auteur puis remplit), `E2EEEnvelopeOpener.swift:140-149`
 *   et `:176-192` (confrontation à l'enveloppe, conversation d'abord) ;
 * - Kotlin, recopié d'iOS : `apps/android/core/e2ee/src/main/kotlin/me/meeshy/core/e2ee/content/E2eeContent.kt:17-107`,
 *   `E2eePayload.kt:11-58`, `open/E2eeEnvelopeOpener.kt:98-106` et `:174-187`.
 *
 * Les vecteurs `packages/shared/fixtures/e2ee-content/` et `fixtures/e2ee-signal/`
 * fixent ces octets pour les trois clients ; leur README dit comment chacun les
 * rejoue. Une seule divergence VOULUE avec l'iPhone d'aujourd'hui : la version
 * se lit AVANT tout le reste, et une version future rend le verdict
 * `future-version` avec son JSON — jamais « illisible » — pour qu'un appareil
 * la garde et la relise après sa mise à jour (#9223 ; IOS-04 et AND-04 de la
 * revue du 2026-11-17 : aujourd'hui iOS et Android l'acquittent puis la perdent).
 *
 * Rien ici n'est une primitive cryptographique : l'authenticité vient de
 * libsignal (l'appareil émetteur), ce contrat ne fait que lier le clair à SA
 * conversation et à SON auteur, que libsignal ne couvre pas.
 */
import { z } from 'zod';
import { e2eePaddedLength } from './e2ee-signals.js';

/** La version du contenu d'un message (clé `v`). */
export const E2EE_CONTENT_VERSION = 1 as const;
/** La version d'un signal (clé `s` — jamais `v`, pour qu'un client antérieur ne le lise pas comme un message). */
export const E2EE_SIGNAL_VERSION = 1 as const;

/**
 * La profondeur d'imbrication la plus grande d'un clair (#19112) : un contenu a
 * une profondeur de 1 (l'objet), un signal de 2 au plus. Elle se compte AVANT
 * l'analyse, hors des chaînes (`nestsWithin`) ; au-delà, le clair est illisible
 * (`not-json`), quelle que soit sa version. Sans borne, un pair qui scelle
 * 30 000 crochets faisait déborder un analyseur récursif (kotlinx) et se lisait
 * sous un autre (`JSON.parse`) : le même clair ne rendait pas le même verdict.
 */
export const E2EE_MAX_DEPTH = 64;

/** Un `Int64` Swift (`sentAt`, en millisecondes) : un entier JSON sûr, sans coercition. */
const int64 = z.number().int();
/** Un `UInt32` Swift (`authorDeviceId`). */
const uint32 = z.number().int().min(0).max(0xffffffff);

/**
 * Le contenu d'un message, version 1 (`E2EEContent.swift:9-29`). Toute clé est
 * facultative sauf `v` et `sentAt` ; une clé à `null` se lit absente
 * (`decodeIfPresent`) ; une clé inconnue est ignorée (une mention ou une pièce
 * d'un lot ultérieur ne casse pas la version 1) ; une clé connue du mauvais type
 * rend le contenu illisible.
 */
export const e2eeContentV1Schema = z.object({
  v: z.literal(E2EE_CONTENT_VERSION),
  text: z.string().optional(),
  /** La langue d'origine : elle voyage DEDANS, jamais en champ libre du message (#12526). */
  language: z.string().optional(),
  /** L'identifiant SERVEUR du message cité. */
  replyTo: z.string().optional(),
  /** La conversation pour laquelle le contenu a été écrit : libsignal ne la couvre pas. */
  conversationId: z.string().optional(),
  clientMessageId: z.string().optional(),
  /** L'instant de composition, en millisecondes depuis 1970. */
  sentAt: int64,
  /** L'auteur, posé par le scelleur (#12976) ; absent chez un client antérieur. */
  authorUserId: z.string().optional(),
  authorDeviceId: uint32.optional(),
});

export type E2EEContentV1 = Readonly<z.infer<typeof e2eeContentV1Schema>>;

/** Ce que tout signal porte, quelle que soit son action (`E2EESignal.swift:103-110`). */
const signalHeader = {
  s: z.literal(E2EE_SIGNAL_VERSION),
  /** REQUISE, au contraire du contenu : un signal sans conversation est illisible. */
  conversationId: z.string(),
  sentAt: int64,
  authorUserId: z.string().optional(),
  authorDeviceId: uint32.optional(),
};

/** L'en-tête d'un signal, suffisant pour juger une action d'une version ultérieure (`E2EESignalAction.unknown`). */
export const e2eeSignalHeaderV1Schema = z.object({ ...signalHeader, kind: z.string() });

export type E2EESignalHeaderV1 = Readonly<z.infer<typeof e2eeSignalHeaderV1Schema>>;

/** Les actions connues de la version 1 (`E2EESignal.swift:113-139`). */
export const e2eeSignalV1Schema = z.discriminatedUnion('kind', [
  z.object({ ...signalHeader, kind: z.literal('reaction'), target: z.string(), emoji: z.string(), removed: z.boolean() }),
  z.object({ ...signalHeader, kind: z.literal('typing'), active: z.boolean() }),
  z.object({ ...signalHeader, kind: z.literal('receipt'), receipt: z.enum(['delivered', 'read']), targets: z.array(z.string()) }),
  z.object({
    ...signalHeader,
    kind: z.literal('read-progress'),
    target: z.string(),
    attachmentId: z.string().optional(),
    position: z.number(),
    completed: z.boolean(),
  }),
  z.object({ ...signalHeader, kind: z.literal('edit'), target: z.string(), text: z.string(), language: z.string().optional() }),
  z.object({ ...signalHeader, kind: z.literal('delete-for-everyone'), target: z.string() }),
  z.object({ ...signalHeader, kind: z.literal('view-once-opened'), target: z.string() }),
  z.object({ ...signalHeader, kind: z.literal('pin'), target: z.string(), pinned: z.boolean() }),
]);

export type E2EESignalV1 = Readonly<z.infer<typeof e2eeSignalV1Schema>>;

export const E2EE_SIGNAL_KINDS: readonly E2EESignalV1['kind'][] = e2eeSignalV1Schema.options.map((option) => option.shape.kind.value);

export type E2EESignalKind = E2EESignalV1['kind'];

const isKnownSignalKind = (kind: string): kind is E2EESignalKind => (E2EE_SIGNAL_KINDS as readonly string[]).includes(kind);

/** Le clair tel que libsignal le rend (octets), ou déjà décodé en texte. */
export type E2EEPlaintext = Uint8Array | string;

/** Ce qu'un clair déchiffré porte : un message (`v`) ou un signal (`s`). */
export type E2EEPlaintextPayload = 'message' | 'signal';

/** Pourquoi un clair est illisible — pour le journal de l'appareil, jamais pour l'interface. */
export type E2EEUnreadableReason = 'not-utf8' | 'not-json' | 'not-an-object' | 'invalid-version' | 'invalid-fields';

type Unreadable = { readonly verdict: 'unreadable'; readonly reason: E2EEUnreadableReason };

/**
 * Une version que cet appareil ne lit pas encore. Le JSON, privé de ses blancs
 * de fin (le remplissage et tout blanc qui le suivrait), est rendu pour être
 * GARDÉ et relu après la mise à jour : un message d'une version future n'est ni
 * affiché à moitié, ni perdu.
 */
type FutureVersion = { readonly verdict: 'future-version'; readonly version: number; readonly json: string };

export type E2EEContentReading = { readonly verdict: 'read'; readonly content: E2EEContentV1 } | FutureVersion | Unreadable;

export type E2EESignalReading =
  | { readonly verdict: 'read'; readonly signal: E2EESignalV1 }
  /** Une action d'une version ultérieure : reconnue comme signal, jamais appliquée à moitié. */
  | { readonly verdict: 'unknown-kind'; readonly header: E2EESignalHeaderV1 }
  | FutureVersion
  | Unreadable;

/** Ce que le serveur dit de l'enveloppe, et que le clair doit confirmer. */
export type E2EEEnvelopeOrigin = {
  readonly conversationId: string;
  readonly senderUserId: string;
  readonly senderDeviceId: number;
};

type Misattributed = { readonly verdict: 'misattributed-conversation' | 'misattributed-author' };

export type E2EEContentOpening =
  | { readonly verdict: 'admitted'; readonly content: E2EEContentV1 }
  /**
   * Ni `authorUserId` ni `authorDeviceId` : un client antérieur à #12976. iOS et
   * Android l'admettent aujourd'hui ; le verdict le distingue pour qu'on puisse le
   * refuser à usage mesuré nul sans changer de forme (IOS-20).
   */
  | { readonly verdict: 'admitted-unauthored'; readonly content: E2EEContentV1 }
  | FutureVersion
  | Unreadable
  | Misattributed;

export type E2EESignalOpening =
  | { readonly verdict: 'admitted'; readonly signal: E2EESignalV1 }
  | { readonly verdict: 'admitted-unknown-kind'; readonly header: E2EESignalHeaderV1 }
  | FutureVersion
  | Unreadable
  | Misattributed;

export type E2EEOpening =
  | ({ readonly payload: 'message' } & E2EEContentOpening)
  | ({ readonly payload: 'signal' } & E2EESignalOpening);

type JsonRecord = Readonly<Record<string, unknown>>;

type Parsed = { readonly ok: true; readonly text: string; readonly value: unknown } | { readonly ok: false; readonly reason: E2EEUnreadableReason };

/** UTF-8 strict (JSONDecoder refuse une séquence invalide) ; un BOM n'est pas retiré : il rend le JSON illisible. */
const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** En mode `u`, une paire de substitution est UN point de code : cette classe ne voit que les demi-paires. */
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

const isIllFormed = (value: unknown): boolean => typeof value === 'string' && LONE_SURROGATE.test(value);

/**
 * `JSON.parse` admet l'échappement d'une demi-paire de substitution
 * (`"\ud800"`) ; l'encodeur refuse de l'écrire et le `JSONDecoder` de l'iPhone
 * la refuse (voir le README des vecteurs). Une clé ou une valeur qui en porte
 * une, où qu'elle soit, rend le clair illisible (`not-json`), jamais un texte à
 * demi-paire (WEBX-06).
 */
const refusingLoneSurrogates = (key: string, value: unknown): unknown => {
  if (isIllFormed(key) || isIllFormed(value)) throw new SyntaxError('e2ee content: lone UTF-16 surrogate');
  return value;
};

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPENERS: ReadonlySet<number> = new Set([0x5b, 0x7b]);
const CLOSERS: ReadonlySet<number> = new Set([0x5d, 0x7d]);

/**
 * La profondeur reste-t-elle sous la borne ? Un parcours LINÉAIRE du texte, sans
 * analyse : `[` et `{` ouvrent un niveau, `]` et `}` le ferment, et rien ne
 * compte entre deux guillemets — où une barre oblique inverse échappe l'unité
 * qui la suit : `\"` ne ferme pas la chaîne, `\\"` la ferme. Les délimiteurs sont
 * ASCII : compter sur des unités UTF-16, des octets UTF-8 ou des points de code
 * donne le même résultat. Pour un JSON valide, le compte est sa profondeur ; un
 * texte qui n'en est pas un, l'analyse le refuse ensuite.
 */
const nestsWithin = (text: string, limit: number): boolean => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      escaped = unit === BACKSLASH;
      inString = unit !== QUOTE;
      continue;
    }
    if (unit === QUOTE) inString = true;
    if (CLOSERS.has(unit)) depth -= 1;
    if (OPENERS.has(unit)) depth += 1;
    if (depth > limit) return false;
  }
  return true;
};

/** UTF-8 strict d'abord (`not-utf8`), puis la profondeur (`not-json`), puis l'analyse. */
const parse = (plaintext: E2EEPlaintext): Parsed => {
  const text = typeof plaintext === 'string' ? plaintext : decodeUtf8(plaintext);
  if (text === null) return { ok: false, reason: 'not-utf8' };
  if (!nestsWithin(text, E2EE_MAX_DEPTH)) return { ok: false, reason: 'not-json' };
  try {
    return { ok: true, text, value: JSON.parse(text, refusingLoneSurrogates) as unknown };
  } catch {
    return { ok: false, reason: 'not-json' };
  }
};

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un entier JSON, comme `Int` de JSONDecoder : `1` et `1.0` oui, `1.5`, `"1"` et `null` non. */
const isJsonInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/** Une clé à `null` se lit absente (`decodeIfPresent` ; `explicitNulls = false` côté Kotlin). */
const withoutNulls = (record: JsonRecord): JsonRecord => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));

/** Les blancs JSON (RFC 8259 § 2) : après un objet que `JSON.parse` a lu, les seuls caractères qui peuvent le suivre. */
const JSON_WHITESPACE: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d]);

/**
 * Le JSON sans ce qui le suit : le remplissage (des espaces) et tout autre blanc
 * qu'un émetteur y aurait ajouté. Un parcours LINÉAIRE depuis la fin, jamais une
 * expression ancrée sur `$` : `/ +$/` retentait chaque départ dans la suite
 * d'espaces et échouait au `\n` final — 0,8 s pour 48 Ko, sous le verrou du
 * coffre de l'appareil (WEBX-06).
 */
const withoutTrailingWhitespace = (text: string): string => {
  let end = text.length;
  while (end > 0 && JSON_WHITESPACE.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
};

const unreadable = (reason: E2EEUnreadableReason): Unreadable => ({ verdict: 'unreadable', reason });

/**
 * La sonde (`E2EEPayloadKind.of`, `E2EESignal.swift:211-217`) : un signal si et
 * seulement si `s` est un ENTIER JSON ; tout le reste — `s` absent, `null`, une
 * chaîne, `1.5`, un JSON illisible — est un message, que le lecteur de contenu
 * jugera. Android (`E2eePayload.kt`) classe signal tout `s` non nul : à aligner,
 * les vecteurs le montrent.
 */
const payloadOf = (parsed: Parsed): E2EEPlaintextPayload =>
  parsed.ok && isRecord(parsed.value) && isJsonInteger(parsed.value.s) ? 'signal' : 'message';

export function e2eePlaintextPayload(plaintext: E2EEPlaintext): E2EEPlaintextPayload {
  return payloadOf(parse(plaintext));
}

/** L'objet JSON du clair, ses clés à `null` ôtées — ou ce qui le rend illisible. */
const recordOf = (parsed: Parsed): { readonly record: JsonRecord; readonly text: string } | Unreadable => {
  if (!parsed.ok) return unreadable(parsed.reason);
  return isRecord(parsed.value) ? { record: withoutNulls(parsed.value), text: parsed.text } : unreadable('not-an-object');
};

/** La version se juge AVANT toute autre clé : une version future garde son JSON quelle que soit sa forme. */
const versionVerdict = (version: unknown, current: number, text: string): FutureVersion | Unreadable | null => {
  if (!isJsonInteger(version)) return unreadable('invalid-version');
  if (version > current) return { verdict: 'future-version', version, json: withoutTrailingWhitespace(text) };
  return version === current ? null : unreadable('invalid-version');
};

const readContent = (parsed: Parsed): E2EEContentReading => {
  const object = recordOf(parsed);
  if ('verdict' in object) return object;
  const versioned = versionVerdict(object.record.v, E2EE_CONTENT_VERSION, object.text);
  if (versioned) return versioned;
  const result = e2eeContentV1Schema.safeParse(object.record);
  return result.success ? { verdict: 'read', content: result.data } : unreadable('invalid-fields');
};

const readSignal = (parsed: Parsed): E2EESignalReading => {
  const object = recordOf(parsed);
  if ('verdict' in object) return object;
  const versioned = versionVerdict(object.record.s, E2EE_SIGNAL_VERSION, object.text);
  if (versioned) return versioned;
  const header = e2eeSignalHeaderV1Schema.safeParse(object.record);
  if (!header.success) return unreadable('invalid-fields');
  if (!isKnownSignalKind(header.data.kind)) return { verdict: 'unknown-kind', header: header.data };
  const signal = e2eeSignalV1Schema.safeParse(object.record);
  return signal.success ? { verdict: 'read', signal: signal.data } : unreadable('invalid-fields');
};

/** Lit le contenu d'un message (`E2EEContent.decoded`), sans le confronter à son enveloppe. */
export function readE2EEContent(plaintext: E2EEPlaintext): E2EEContentReading {
  return readContent(parse(plaintext));
}

/** Lit un signal (`E2EESignal.decoded`), sans le confronter à son enveloppe. */
export function readE2EESignal(plaintext: E2EEPlaintext): E2EESignalReading {
  return readSignal(parse(plaintext));
}

/**
 * Le clair est-il à SA place ? D'abord la conversation, puis l'auteur
 * (`E2EEEnvelopeOpener.swift:144-147`). Un contenu sans aucun auteur vient d'un
 * client antérieur ; un auteur à moitié n'est l'auteur de personne.
 */
const openContent = (reading: E2EEContentReading, origin: E2EEEnvelopeOrigin): E2EEContentOpening => {
  if (reading.verdict !== 'read') return reading;
  const { content } = reading;
  if (content.conversationId !== origin.conversationId) return { verdict: 'misattributed-conversation' };
  if (content.authorUserId === undefined && content.authorDeviceId === undefined) return { verdict: 'admitted-unauthored', content };
  const authored = content.authorUserId === origin.senderUserId && content.authorDeviceId === origin.senderDeviceId;
  return authored ? { verdict: 'admitted', content } : { verdict: 'misattributed-author' };
};

/** Un signal n'a pas de version antérieure sans auteur : sans auteur, il n'est celui de personne (`E2EESignal.swift:51-56`). */
const signalPlacement = (header: E2EESignalHeaderV1, origin: E2EEEnvelopeOrigin): Misattributed | null => {
  if (header.conversationId !== origin.conversationId) return { verdict: 'misattributed-conversation' };
  const authored = header.authorUserId === origin.senderUserId && header.authorDeviceId === origin.senderDeviceId;
  return authored ? null : { verdict: 'misattributed-author' };
};

const openSignal = (reading: E2EESignalReading, origin: E2EEEnvelopeOrigin): E2EESignalOpening => {
  switch (reading.verdict) {
    case 'read':
      return signalPlacement(reading.signal, origin) ?? { verdict: 'admitted', signal: reading.signal };
    case 'unknown-kind':
      return signalPlacement(reading.header, origin) ?? { verdict: 'admitted-unknown-kind', header: reading.header };
    default:
      return reading;
  }
};

/**
 * Ouvre un clair déchiffré par libsignal : la sonde dit message ou signal, le
 * lecteur rend sa version, et le clair se confronte à l'enveloppe que le serveur
 * a servie. Un appareil n'acquitte une enveloppe que sur un verdict qui la JUGE
 * (`unreadable`, `misattributed-*`) ou qui l'a rangée (`admitted*`) ; une
 * `future-version` se garde, scellée, et se rouvre après la mise à jour.
 */
export function openE2EEPlaintext(plaintext: E2EEPlaintext, origin: E2EEEnvelopeOrigin): E2EEOpening {
  const parsed = parse(plaintext);
  return payloadOf(parsed) === 'signal'
    ? { payload: 'signal', ...openSignal(readSignal(parsed), origin) }
    : { payload: 'message', ...openContent(readContent(parsed), origin) };
}

/**
 * Une chaîne Swift est toujours de l'Unicode bien formé : une demi-paire de
 * substitution, que `JSON.stringify` écrirait `\udxxx`, ne se lirait sur aucun
 * appareil. L'encodeur la refuse, comme le lecteur (`refusingLoneSurrogates`).
 */
const assertWellFormed = (value: unknown): void => {
  if (isIllFormed(value)) throw new TypeError('e2ee content: ill-formed UTF-16 string');
  if (Array.isArray(value)) value.forEach(assertWellFormed);
};

/**
 * Le JSON canonique de `JSONEncoder` avec `.sortedKeys` et
 * `.withoutEscapingSlashes` : clés triées, aucune clé absente écrite, aucun
 * espace, `/` non échappé. `JSON.stringify` d'une chaîne bien formée écrit les
 * mêmes échappements que Swift et kotlinx.serialization (`\"`, `\\`, `\b`,
 * `\f`, `\n`, `\r`, `\t`, `\u00xx` en minuscules pour les autres contrôles, le
 * reste brut en UTF-8). Le tri par point de code coïncide avec celui de Swift
 * (sans casse, numérique) pour toutes les clés de ce contrat — un témoin le
 * garde.
 */
const canonicalJson = (record: JsonRecord): string => {
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  keys.forEach((key) => assertWellFormed(record[key]));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`).join(',')}}`;
};

/**
 * Une paire complète, ou une demi-paire isolée. Sans assertion arrière : un
 * moteur qui ne la connaît pas (Safari avant 16.4) refuserait tout le module.
 */
const PAIR_OR_SURROGATE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/**
 * Le texte d'un client web rendu bien formé AVANT l'encodage (audit de #19080,
 * E7) : chaque demi-paire isolée devient U+FFFD, comme
 * `String.prototype.toWellFormed`. L'encodeur lève sur une demi-paire, qu'aucun
 * appareil ne lirait ; une chaîne Swift n'en porte jamais et l'encodeur de la
 * JVM la remplace, mais un texte web peut en porter une (copier-coller, emoji
 * tronqué) : normalisé, il part au lieu d'être perdu.
 */
export function wellFormedE2EEText(text: string): string {
  return text.replace(PAIR_OR_SURROGATE, (match) => (match.length === 2 ? match : '\uFFFD'));
}

/** Le JSON canonique d'un contenu (`E2EEContent.encoded`). Lève sur un contenu hors contrat ; une clé inconnue n'est jamais écrite. */
export function encodeE2EEContent(content: E2EEContentV1): string {
  return canonicalJson(e2eeContentV1Schema.parse(content));
}

/** Le JSON canonique d'un signal (`E2EESignal.encoded`). Lève sur un signal hors contrat. */
export function encodeE2EESignal(signal: E2EESignalV1): string {
  return canonicalJson(e2eeSignalV1Schema.parse(signal));
}

const SPACE = 0x20;

/**
 * Le clair que libsignal chiffre : le JSON canonique en UTF-8, suivi d'espaces
 * jusqu'au palier de `recipients` enveloppes (`E2EEPadding.padded`). Le palier
 * se choisit sur les OCTETS, jamais sur les caractères.
 */
export function padE2EEPlaintext(canonicalJson: string, recipients: number): Uint8Array {
  const bytes = new TextEncoder().encode(canonicalJson);
  const target = e2eePaddedLength(bytes.length, recipients);
  if (target <= bytes.length) return bytes;
  const padded = new Uint8Array(target).fill(SPACE);
  padded.set(bytes);
  return padded;
}
