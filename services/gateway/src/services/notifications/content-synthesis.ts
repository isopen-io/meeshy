/**
 * #14309 — la SYNTHÈSE d'un contenu, ce qu'une notification en dit à la place
 * de le montrer (décision porteur du 2026-11-01).
 *
 * Une bannière n'affiche plus le texte d'un message ni l'image qu'il porte :
 * elle dit sa LONGUEUR (« Message texte », « Long essai texte ») et la NATURE de
 * ses pièces jointes (« Image haute définition », « PDF de 12 pages »). Rien de
 * ce que l'auteur a écrit, nommé ou photographié ne part sur l'écran verrouillé
 * — ni le texte, ni le nom d'un fichier, ni celui d'un contact, ni l'adresse
 * d'un lien ou d'une position.
 *
 * Fonctions PURES, dans la langue de CADRAGE du destinataire. Résolu une fois
 * côté serveur : `payload.body` est ce que les trois clients rendent, donc un
 * client ancien affiche la synthèse sans mise à jour.
 */

import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';
import { normalizeNotificationLanguage } from '@meeshy/shared/utils/notification-strings';
import { isContactCardAttachment } from '@meeshy/shared/utils/vcard';

import {
  SYNTHESIS_KINDS,
  SYNTHESIS_STRINGS,
  type CountedLabel,
  type SynthesisKind,
  type SynthesisStrings,
} from './content-synthesis-strings';

export type SynthesisAttachment = {
  readonly mimeType?: string | null;
  readonly fileName?: string | null;
  readonly originalName?: string | null;
  readonly pageCount?: number | null;
  readonly lineCount?: number | null;
};

const BODY_SEPARATOR = ' · ';

/** Les bornes HAUTES (exclues) des six premiers paliers ; au-delà, le septième. */
const TEXT_TIERS = [2, 5, 30, 100, 300, 600] as const;

const VOICE_NAME = /^(voice|vocal|recording|enregistrement)[-_ .]/i;

const EXTENSION_KIND: Readonly<Record<string, SynthesisKind>> = {
  pdf: 'pdf',
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', pages: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet', numbers: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation', key: 'presentation',
  txt: 'text', md: 'text', csv: 'text', json: 'text', xml: 'text', html: 'text', htm: 'text',
  yml: 'text', yaml: 'text', log: 'text', js: 'text', ts: 'text', py: 'text', swift: 'text',
  kt: 'text', java: 'text', c: 'text', cpp: 'text', h: 'text', css: 'text', sh: 'text', sql: 'text',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
};

const strings = (lang: string): SynthesisStrings => SYNTHESIS_STRINGS[normalizeNotificationLanguage(lang)];

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Le nombre de mots d'un texte — mots d'écriture, et un émoji compte pour un. */
export function wordCount(text: string): number {
  return Array.from(segmenter.segment(text))
    .filter((segment) => segment.isWordLike || PICTOGRAPHIC.test(segment.segment))
    .length;
}

/** Les sept paliers de la langue, dans l'ordre — pour qui doit les reconnaître dans un corps déjà servi. */
export function textSynthesisLabels(lang: string): readonly string[] {
  return strings(lang).text;
}

/** Ce qu'un texte EST, par sa longueur ; `''` quand il n'y a rien à dire. */
export function textSynthesis(lang: string, text: string | null | undefined): string {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return '';
  const count = Math.max(1, wordCount(trimmed));
  const tier = TEXT_TIERS.findIndex((bound) => count < bound);
  return strings(lang).text[tier === -1 ? TEXT_TIERS.length : tier];
}

function extensionOf(name: string | null | undefined): string | null {
  const dot = name?.lastIndexOf('.') ?? -1;
  if (!name || dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** La nature d'une pièce jointe, lue sur son type et son extension — jamais sur ce qu'elle contient. */
export function synthesisKindOf(attachment: SynthesisAttachment): SynthesisKind {
  const mime = attachment.mimeType?.toLowerCase() ?? '';
  const name = attachment.originalName ?? attachment.fileName;
  if (isContactCardAttachment({ mimeType: mime, fileName: name })) return 'contact';
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) {
    return VOICE_NAME.test(attachment.fileName ?? '') || VOICE_NAME.test(attachment.originalName ?? '') ? 'voice' : 'audio';
  }
  if (mime === 'application/pdf') return 'pdf';
  const byExtension = EXTENSION_KIND[extensionOf(name) ?? extensionOf(attachment.fileName) ?? ''];
  if (byExtension) return byExtension;
  return mime.startsWith('text/') ? 'text' : 'file';
}

const isCounted = (label: string | CountedLabel): label is CountedLabel => typeof label !== 'string';

function countOf(kind: SynthesisKind, attachment: SynthesisAttachment): number | null {
  const raw = kind === 'text' ? attachment.lineCount : attachment.pageCount;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

function singleLabel(lang: string, attachment: SynthesisAttachment): string {
  const kind = synthesisKindOf(attachment);
  const label = strings(lang).single[kind];
  if (!isCounted(label)) return label;
  const n = countOf(kind, attachment);
  if (n === null) return label.unknown;
  return n === 1 ? label.one : label.many.replace('{n}', String(n));
}

function countPhrase(table: SynthesisStrings, kind: SynthesisKind, n: number): string {
  const [one, other] = table.noun[kind];
  return table.countPhrase.replace('{n}', String(n)).replace('{noun}', n === 1 ? one : other);
}

/** Ce que des pièces jointes SONT : une seule se décrit, plusieurs se comptent par nature. */
export function attachmentsSynthesis(lang: string, attachments: ReadonlyArray<SynthesisAttachment>): string {
  if (attachments.length === 0) return '';
  if (attachments.length === 1) return singleLabel(lang, attachments[0]);
  const table = strings(lang);
  const kinds = attachments.map(synthesisKindOf);
  return SYNTHESIS_KINDS
    .map((kind) => ({ kind, n: kinds.filter((k) => k === kind).length }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ kind, n }) => countPhrase(table, kind, n))
    .join(table.listSeparator);
}

const withoutUrl = (text: string, url: string | undefined): string =>
  url ? text.replace(url, '').replace(/\s{2,}/g, ' ').trim() : text;

function detailLabel(table: SynthesisStrings, detail: NotificationContentDetail | undefined): string {
  if (detail?.location) return table.location;
  if (detail?.sticker) return table.sticker;
  if (detail?.invite) return table.invitation;
  if (detail?.link) return table.link;
  return '';
}

/**
 * La synthèse d'un contenu entier : le texte (sans l'adresse d'un lien ou d'une
 * invitation qu'il porte), ce que son détail EST, puis ses pièces jointes — sauf
 * celle d'un autocollant, dont l'image EST l'autocollant.
 * `''` quand il n'a rien de tout cela.
 */
export function contentSynthesis(lang: string, params: {
  readonly text: string | null | undefined;
  readonly attachments: ReadonlyArray<SynthesisAttachment>;
  readonly detail?: NotificationContentDetail;
}): string {
  const table = strings(lang);
  const bareText = withoutUrl(withoutUrl(params.text ?? '', params.detail?.invite?.url), params.detail?.link?.url);
  return [
    textSynthesis(lang, bareText),
    detailLabel(table, params.detail),
    params.detail?.sticker ? '' : attachmentsSynthesis(lang, params.attachments),
  ].filter((part) => part !== '').join(BODY_SEPARATOR);
}

/** La nature d'un média de post, telle que `resolvePostMedia` la lit. */
export type PostMediaKind = 'image' | 'video' | 'audio';

const POST_MEDIA_MIME: Readonly<Record<PostMediaKind, string>> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

/** #14318 — la synthèse d'un post, d'une story ou d'un commentaire : son texte, puis son média. */
export function postSynthesis(lang: string, params: {
  readonly text: string | null | undefined;
  readonly mediaType?: PostMediaKind | null;
}): string {
  return contentSynthesis(lang, {
    text: params.text,
    attachments: params.mediaType ? [{ mimeType: POST_MEDIA_MIME[params.mediaType] }] : [],
  });
}

/** La langue dont `label` est un palier de texte, ou `null` — pour réécrire un corps déjà servi. */
export function languageOfTextSynthesis(label: string): string | null {
  const match = Object.entries(SYNTHESIS_STRINGS).find(([, table]) => table.text.includes(label));
  return match ? match[0] : null;
}
