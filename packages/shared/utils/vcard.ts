/**
 * Lecture d'une carte de visite vCard (#8101) — fonction PURE, sans I/O.
 *
 * Accepte les trois générations qu'on reçoit réellement : 2.1 (Android, vieux
 * téléphones : types nus, QUOTED-PRINTABLE, CHARSET), 3.0 (iPhone, groupes
 * `itemN.` et libellés `X-ABLabel`) et 4.0 (`TYPE="cell,voice"`, `tel:` URI).
 * Une carte illisible rend `null` ; un champ illisible est ÉCARTÉ, jamais
 * fatal. Le contrat des types vit dans `packages/shared/types/contact-card.ts`.
 */

import {
  CONTACT_CARD_EXTENSION,
  CONTACT_CARD_MIME_TYPE,
  CONTACT_RESOLVE_MAX_IDENTIFIERS,
  type ParsedVCard,
  type ResolveContactsRequest,
  type VCardKnownLabel,
  type VCardLabeledValue,
} from '../types/contact-card.js';

const MAX_INPUT_LENGTH = 512 * 1024;
const MAX_ITEMS_PER_LIST = 50;

const CONTACT_CARD_MIME_ALIASES: ReadonlySet<string> = new Set([
  'text/vcard',
  'text/x-vcard',
  'text/directory',
  'text/x-vcf',
]);

const GENERIC_MIME_TYPES: ReadonlySet<string> = new Set([
  '',
  'application/octet-stream',
  'text/plain',
  'application/vcard',
]);

const CONTACT_CARD_FILE = /\.(vcf|vcard)$/i;

const ENCODING_TOKENS: ReadonlySet<string> = new Set(['QUOTED-PRINTABLE', 'BASE64', 'B', '8BIT', '7BIT']);

const LABEL_BY_TYPE: ReadonlyArray<readonly [string, VCardKnownLabel]> = [
  ['CELL', 'mobile'],
  ['MOBILE', 'mobile'],
  ['IPHONE', 'iphone'],
  ['FAX', 'fax'],
  ['HOMEFAX', 'fax'],
  ['WORKFAX', 'fax'],
  ['PAGER', 'pager'],
  ['MAIN', 'main'],
  ['HOME', 'home'],
  ['WORK', 'work'],
  ['OTHER', 'other'],
];

const KNOWN_APPLE_LABELS: Readonly<Record<string, VCardKnownLabel>> = {
  mobile: 'mobile',
  iphone: 'iphone',
  home: 'home',
  work: 'work',
  main: 'main',
  other: 'other',
  homefax: 'fax',
  workfax: 'fax',
  otherfax: 'fax',
  pager: 'pager',
};

type VCardLine = {
  readonly group: string | null;
  readonly name: string;
  readonly types: readonly string[];
  readonly value: string;
};

const stripMimeParameters = (mimeType: string): string => (mimeType.split(';')[0] ?? '').trim().toLowerCase();

/** `text/vcard` et ses alias (`text/x-vcard`, `text/directory`), paramètres ignorés. */
export function isContactCardMimeType(mimeType: string | null | undefined): boolean {
  return CONTACT_CARD_MIME_ALIASES.has(stripMimeParameters(mimeType ?? ''));
}

/**
 * Le type MIME canonique d'un fichier téléversé : une carte de visite sort
 * toujours `text/vcard`, qu'elle soit déclarée par un alias ou seulement
 * reconnaissable à son extension sous un type générique. Tout autre type est
 * rendu tel quel.
 */
export function normalizeContactCardMimeType(mimeType: string, fileName?: string | null): string {
  if (isContactCardMimeType(mimeType)) return CONTACT_CARD_MIME_TYPE;
  const isGeneric = GENERIC_MIME_TYPES.has(stripMimeParameters(mimeType));
  if (isGeneric && fileName && CONTACT_CARD_FILE.test(fileName.trim())) return CONTACT_CARD_MIME_TYPE;
  return mimeType;
}

/** Une pièce jointe est-elle une carte de visite ? */
export function isContactCardAttachment(attachment: {
  readonly mimeType?: string | null;
  readonly fileName?: string | null;
}): boolean {
  return normalizeContactCardMimeType(attachment.mimeType ?? '', attachment.fileName) === CONTACT_CARD_MIME_TYPE;
}

const TEMPORARY_CONTACT_PREFIX = /^contact_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;

/**
 * Le nom HUMAIN d'une carte de visite lu dans son nom de fichier (#8142, #8148) :
 * sans extension ni le préfixe `contact_<UUID>_` que les anciens envois
 * portent encore. `null` quand il ne reste aucun nom. Miroir de
 * `ContactCardFile.displayName(fromFileName:)` (SDK Swift).
 */
export function contactCardNameFromFileName(fileName: string | null | undefined): string | null {
  const name = (fileName ?? '').trim().replace(CONTACT_CARD_FILE, '').replace(TEMPORARY_CONTACT_PREFIX, '').trim();
  return name === '' ? null : name;
}

const indexOutsideQuotes =(text: string, target: string): number => {
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') inQuotes = !inQuotes;
    if (char === target && !inQuotes) return index;
  }
  return -1;
};

const splitOutsideQuotes = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let rest = text;
  for (let cut = indexOutsideQuotes(rest, separator); cut >= 0; cut = indexOutsideQuotes(rest, separator)) {
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut + 1);
  }
  return [...parts, rest];
};

const isQuotedPrintableHead = (head: string): boolean => /(^|;)(ENCODING=)?QUOTED-PRINTABLE(;|$)/i.test(head);

const headOf = (line: string): string => {
  const colon = indexOutsideQuotes(line, ':');
  return colon < 0 ? '' : line.slice(0, colon);
};

/** Déplie le pliage RFC (espace / tabulation) et les sauts doux du QUOTED-PRINTABLE. */
const unfold = (text: string): string[] =>
  text.split(/\r\n|\n|\r/).reduce<string[]>((lines, raw) => {
    const previous = lines[lines.length - 1];
    if (previous !== undefined && /^[ \t]/.test(raw)) {
      return [...lines.slice(0, -1), previous + raw.slice(1)];
    }
    if (previous !== undefined && previous.endsWith('=') && isQuotedPrintableHead(headOf(previous))) {
      return [...lines.slice(0, -1), previous.slice(0, -1) + raw];
    }
    return [...lines, raw];
  }, []);

const decodeQuotedPrintable = (value: string, charset: string): string => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const hex = value.slice(index + 1, index + 3);
    if (value[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(value.charCodeAt(index) & 0xff);
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
};

const unescapeText = (value: string): string =>
  value.replace(/\\([nN,;:\\])/g, (_, char: string) => (char === 'n' || char === 'N' ? '\n' : char));

const unquote = (value: string): string => value.replace(/^"|"$/g, '');

const parseLine = (line: string): VCardLine | null => {
  const colon = indexOutsideQuotes(line, ':');
  if (colon <= 0) return null;
  const [rawName = '', ...params] = splitOutsideQuotes(line.slice(0, colon), ';');
  const dot = rawName.lastIndexOf('.');
  const group = dot > 0 ? rawName.slice(0, dot).toLowerCase() : null;
  const name = (dot > 0 ? rawName.slice(dot + 1) : rawName).trim().toUpperCase();

  const pairs = params.map((param) => {
    const equal = param.indexOf('=');
    return equal < 0
      ? { key: 'TYPE', value: param.trim() }
      : { key: param.slice(0, equal).trim().toUpperCase(), value: param.slice(equal + 1).trim() };
  });
  const paramValue = (key: string): string | undefined => pairs.find((pair) => pair.key === key)?.value;

  const types = pairs
    .filter((pair) => pair.key === 'TYPE')
    .flatMap((pair) => unquote(pair.value).split(','))
    .map((type) => type.trim().toUpperCase())
    .filter((type) => type !== '' && !ENCODING_TOKENS.has(type));

  const rawValue = line.slice(colon + 1);
  const isQuotedPrintable =
    (paramValue('ENCODING') ?? '').toUpperCase() === 'QUOTED-PRINTABLE' ||
    pairs.some((pair) => pair.key === 'TYPE' && pair.value.toUpperCase() === 'QUOTED-PRINTABLE');
  const value = isQuotedPrintable
    ? decodeQuotedPrintable(rawValue, unquote(paramValue('CHARSET') ?? 'utf-8'))
    : rawValue;

  return { group, name, types, value };
};

/** Découpe une valeur structurée (N, ADR, ORG) sur les `;` non échappés. */
const structured = (value: string): string[] =>
  value.split(/(?<!\\);/).map((component) => unescapeText(component).trim());

const appleLabel = (raw: string): string | null => {
  const cleaned = raw.replace(/^_\$!<(.*)>!\$_$/, '$1').trim();
  if (cleaned === '') return null;
  return KNOWN_APPLE_LABELS[cleaned.toLowerCase().replace(/\s+/g, '')] ?? cleaned;
};

const labelFromTypes = (types: readonly string[]): string | null =>
  LABEL_BY_TYPE.find(([type]) => types.includes(type))?.[1] ?? null;

const birthdayOf = (raw: string): string => {
  const date = raw.trim().split('T')[0] ?? '';
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  if (/^--\d{4}$/.test(date)) return `--${date.slice(2, 4)}-${date.slice(4, 6)}`;
  return date;
};

const phoneKey = (value: string): string => value.replace(/[\s().\-/]/g, '');

const uniqueLabeled = (
  values: readonly VCardLabeledValue[],
  keyOf: (value: string) => string,
): VCardLabeledValue[] => {
  const seen = new Set<string>();
  return values
    .filter((entry) => {
      const key = keyOf(entry.value);
      if (entry.value === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS_PER_LIST);
};

const firstCardLines = (text: string): VCardLine[] | null => {
  const lines = unfold(text.slice(0, MAX_INPUT_LENGTH));
  const begin = lines.findIndex((line) => /^BEGIN:VCARD\s*$/i.test(line.trim()));
  if (begin < 0) return null;
  const endOffset = lines.slice(begin + 1).findIndex((line) => /^END:VCARD\s*$/i.test(line.trim()));
  const body = endOffset < 0 ? lines.slice(begin + 1) : lines.slice(begin + 1, begin + 1 + endOffset);
  return body.map(parseLine).filter((line): line is VCardLine => line !== null);
};

const optional = <K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> =>
  value ? ({ [key]: value } as Partial<Record<K, string>>) : {};

/**
 * Lit la PREMIÈRE carte d'un texte vCard. `null` quand le texte ne porte
 * aucune carte (`BEGIN:VCARD` absent).
 */
export function parseVCard(text: string): ParsedVCard | null {
  const lines = firstCardLines(text);
  if (!lines) return null;

  const labelsByGroup = new Map(
    lines
      .filter((line) => line.name === 'X-ABLABEL' && line.group)
      .map((line) => [line.group as string, appleLabel(unescapeText(line.value))] as const),
  );
  const labelOf = (line: VCardLine): string | null =>
    (line.group ? labelsByGroup.get(line.group) : undefined) ?? labelFromTypes(line.types);
  const named = (name: string): VCardLine[] => lines.filter((line) => line.name === name);
  const firstText = (name: string): string | undefined => {
    const line = named(name)[0];
    const value = line ? unescapeText(line.value).trim() : '';
    return value === '' ? undefined : value;
  };

  const [familyName, givenName, additionalName, prefix, suffix] = structured(named('N')[0]?.value ?? '');
  const organization = named('ORG')[0] ? structured(named('ORG')[0]?.value ?? '').filter(Boolean).join(', ') : '';

  const phones = uniqueLabeled(
    named('TEL').map((line) => ({ label: labelOf(line), value: unescapeText(line.value).trim().replace(/^tel:/i, '') })),
    phoneKey,
  );
  const emails = uniqueLabeled(
    named('EMAIL').map((line) => ({ label: labelOf(line), value: unescapeText(line.value).trim().replace(/^mailto:/i, '') })),
    (value) => value.toLowerCase(),
  );
  const addresses = uniqueLabeled(
    named('ADR').map((line) => ({
      label: labelOf(line),
      value: structured(line.value)
        .map((component) => component.replace(/\s*\n\s*/g, ', '))
        .filter(Boolean)
        .join(', '),
    })),
    (value) => value.toLowerCase(),
  );
  const urls = [...new Set(named('URL').map((line) => unescapeText(line.value).trim()).filter(Boolean))].slice(
    0,
    MAX_ITEMS_PER_LIST,
  );

  const composedName = [prefix, givenName, additionalName, familyName, suffix].filter(Boolean).join(' ');
  const formattedName =
    firstText('FN') || composedName || organization || phones[0]?.value || emails[0]?.value || '';
  const birthday = firstText('BDAY');

  return {
    formattedName,
    ...optional('givenName', givenName),
    ...optional('familyName', familyName),
    ...optional('organization', organization),
    ...optional('title', firstText('TITLE')),
    phones,
    emails,
    urls,
    addresses,
    ...optional('birthday', birthday ? birthdayOf(birthday) : undefined),
    ...optional('note', firstText('NOTE')),
  };
}

/** Le corps de `POST /contacts/resolve` pour une carte lue. */
export function buildResolveContactsRequest(card: ParsedVCard): ResolveContactsRequest {
  return {
    phones: [...new Set(card.phones.map((phone) => phone.value))].slice(0, CONTACT_RESOLVE_MAX_IDENTIFIERS),
    emails: [...new Set(card.emails.map((email) => email.value.toLowerCase()))].slice(
      0,
      CONTACT_RESOLVE_MAX_IDENTIFIERS,
    ),
  };
}

const TYPE_BY_LABEL: Readonly<Partial<Record<string, string>>> = {
  mobile: 'CELL',
  home: 'HOME',
  work: 'WORK',
  main: 'MAIN',
  fax: 'FAX',
  pager: 'PAGER',
  other: 'OTHER',
};

/** Le libellé Apple d'une clé que `TYPE` ne sait pas dire sans ambiguïté. */
const APPLE_LABEL_BY_KEY: Readonly<Partial<Record<string, string>>> = {
  iphone: '_$!<iPhone>!$_',
};

const MAX_LINE_OCTETS = 75;

const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

/** Plie à 75 octets (RFC 2425 § 5.8.1) : chaque suite commence par une espace. */
const fold = (line: string): string => {
  const encoder = new TextEncoder();
  const folded = [...line].reduce<{ readonly done: readonly string[]; readonly current: string; readonly octets: number }>(
    (acc, char) => {
      const size = encoder.encode(char).length;
      const limit = acc.done.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
      return acc.octets + size > limit
        ? { done: [...acc.done, acc.current], current: char, octets: size }
        : { ...acc, current: acc.current + char, octets: acc.octets + size };
    },
    { done: [], current: '', octets: 0 },
  );
  return [...folded.done, folded.current].join('\r\n ');
};

type LabeledField = {
  readonly name: string;
  readonly entries: readonly VCardLabeledValue[];
  readonly valueOf: (value: string) => string;
  readonly extraTypes: readonly string[];
};

/**
 * Les lignes d'un champ étiqueté : un libellé CONNU devient un `TYPE` (relu
 * par `labelFromTypes`) ; `iphone` et un libellé LIBRE de l'auteur passent par
 * un groupe `itemN.` et son `X-ABLabel`, comme les écrit un iPhone.
 */
const labeledLines = (fields: readonly LabeledField[]): readonly string[] =>
  fields
    .flatMap((field) => field.entries.map((entry) => ({ field, entry })))
    .reduce<{ readonly lines: readonly string[]; readonly groups: number }>(
      (acc, { field, entry }) => {
        const type = entry.label === null ? undefined : TYPE_BY_LABEL[entry.label];
        const types = [...field.extraTypes, ...(type === undefined ? [] : [type])];
        const head = `${field.name}${types.length === 0 ? '' : `;TYPE=${types.join(',')}`}:${field.valueOf(entry.value)}`;
        if (entry.label === null || type !== undefined) return { ...acc, lines: [...acc.lines, head] };
        const group = `item${acc.groups + 1}`;
        const label = APPLE_LABEL_BY_KEY[entry.label] ?? escapeText(entry.label);
        return { lines: [...acc.lines, `${group}.${head}`, `${group}.X-ABLabel:${label}`], groups: acc.groups + 1 };
      },
      { lines: [], groups: 0 },
    ).lines;

const textLine = (key: string, value: string | undefined): string[] =>
  value === undefined || value === '' ? [] : [`${key}:${escapeText(value)}`];

/**
 * Écrit une carte en vCard 3.0 (RFC 2426) — le miroir de `VCardWriter`
 * (SDK Swift) : CRLF, échappements `\n \, \; \\`, lignes pliées à 75 octets.
 * `parseVCard` relit la carte d'origine. Seuls les champs que la carte
 * porte sont écrits : rien n'est inventé, rien ne part à côté (#8242).
 */
export function serializeVCard(card: ParsedVCard): string {
  const name = [card.familyName ?? '', card.givenName ?? '', '', '', ''].map(escapeText).join(';');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${name}`,
    `FN:${escapeText(card.formattedName)}`,
    ...textLine('ORG', card.organization),
    ...textLine('TITLE', card.title),
    ...labeledLines([
      { name: 'TEL', entries: card.phones, valueOf: escapeText, extraTypes: [] },
      { name: 'EMAIL', entries: card.emails, valueOf: escapeText, extraTypes: ['INTERNET'] },
      { name: 'ADR', entries: card.addresses, valueOf: (value) => `;;${escapeText(value)};;;;`, extraTypes: [] },
    ]),
    ...card.urls.flatMap((url) => textLine('URL', url)),
    ...(card.birthday === undefined || card.birthday === '' ? [] : [`BDAY:${card.birthday}`]),
    ...textLine('NOTE', card.note),
    'END:VCARD',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const FORBIDDEN_FILE_NAME_CHARACTERS = /[/\\:?%*|"<>\n\r\t]/g;
const MAX_FILE_NAME_LENGTH = 60;

/**
 * Le nom du fichier d'une carte envoyée : le nom du contact et rien d'autre
 * (#8142), caractères interdits remplacés, borné à 60, `contact` à défaut.
 * Miroir de `ContactCardExporter.fileName(for:)` (iOS).
 */
export function contactCardFileName(displayName: string): string {
  const cleaned = displayName.replace(FORBIDDEN_FILE_NAME_CHARACTERS, ' ').trim();
  const base = cleaned === '' ? 'contact' : [...cleaned].slice(0, MAX_FILE_NAME_LENGTH).join('');
  return `${base}${CONTACT_CARD_EXTENSION}`;
}
