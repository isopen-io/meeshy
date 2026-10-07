/**
 * L'AVIS DE CAPTURE — « Alice a capturé l'éphémère du 07/10/2026 à 14:05 »,
 * « Alice a tenté de capturer un message à vue unique — impossible » (#9617).
 *
 * Même contrat que les autres avis du fil (`join-notice.ts`,
 * `conversation-notice.ts`) : le sens voyage dans `Message.metadata`, jamais
 * dans le texte. La phrase se compose CHEZ LE LECTEUR, dans sa langue et son
 * fuseau ({@link captureNoticeText}) : l'heure dite est l'heure d'ENVOI de
 * l'éphémère capturé, et deux lecteurs de fuseaux différents ne lisent pas le
 * même jour. Le `content` stocké n'est qu'un repli
 * ({@link captureNoticeFallbackText}) pour les clients antérieurs à ce `kind`,
 * qui affichent le texte d'un message système qu'ils ne reconnaissent pas.
 *
 * L'avis ne porte AUCUN contenu du message capturé — ni texte, ni pièce, ni
 * aperçu : son identifiant, sa nature, son heure d'envoi. Il est donc admis
 * tel quel dans une conversation chiffrée de bout en bout.
 */

import type { ContentCaptureKind } from '../types/content-capture.js';
import { CONTENT_CAPTURE_KINDS } from '../types/content-capture.js';
import type { ContentCaptureVerdict, ContentExitNature } from './content-exit-law.js';
import { parseNoticeActor, type NoticeActor } from './conversation-notice.js';
import {
  CONVERSATION_PREVIEW_LANGUAGES,
  normalizeConversationPreviewLanguage,
  type ConversationPreviewLanguage,
} from './conversation-preview-strings.js';

export const CAPTURE_NOTICE_KIND = 'content-capture' as const;

/** Les sept langues du produit — celles du catalogue de l'aperçu de liste. */
export const CAPTURE_NOTICE_LANGUAGES = CONVERSATION_PREVIEW_LANGUAGES;

/** Les natures qu'un avis peut nommer : tout sauf l'ordinaire, dont la capture est libre. */
export type CapturedNature = Exclude<ContentExitNature, 'ordinary'>;
export type CaptureNoticeOutcome = Exclude<ContentCaptureVerdict, 'free'>;

export type CaptureNoticeMetadata = {
  readonly kind: typeof CAPTURE_NOTICE_KIND;
  /** Celui qui a capturé — l'auteur de l'avis. */
  readonly actor: NoticeActor;
  readonly capturedMessageId: string;
  readonly nature: CapturedNature;
  /** `blocked` : vue unique, l'image était noire — une TENTATIVE. `announced` : la capture a eu lieu. */
  readonly outcome: CaptureNoticeOutcome;
  readonly captureKind: ContentCaptureKind;
  /** Heure d'ENVOI du message capturé, ISO 8601. */
  readonly sentAt: string;
};

const CAPTURED_NATURES: ReadonlySet<string> = new Set<CapturedNature>(['timed-flame', 'after-read-flame', 'view-once']);

const outcomeOf = (nature: CapturedNature): CaptureNoticeOutcome => (nature === 'view-once' ? 'blocked' : 'announced');

/** La SEULE fabrique de la métadonnée : l'issue se dérive de la nature, jamais de l'appelant. */
export function captureNoticeMetadata(input: {
  readonly actor: NoticeActor;
  readonly capturedMessageId: string;
  readonly nature: CapturedNature;
  readonly captureKind: ContentCaptureKind;
  readonly sentAt: Date;
}): CaptureNoticeMetadata {
  return {
    kind: CAPTURE_NOTICE_KIND,
    actor: { participantId: input.actor.participantId, displayName: input.actor.displayName },
    capturedMessageId: input.capturedMessageId,
    nature: input.nature,
    outcome: outcomeOf(input.nature),
    captureKind: input.captureKind,
    sentAt: input.sentAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const isCaptureKind = (value: unknown): value is ContentCaptureKind =>
  typeof value === 'string' && (CONTENT_CAPTURE_KINDS as readonly string[]).includes(value);

const isCapturedNature = (value: unknown): value is CapturedNature =>
  typeof value === 'string' && CAPTURED_NATURES.has(value);

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

/**
 * Lit `Message.metadata` comme un avis de capture, ou rend `null`. VALIDE
 * plutôt que caste : une issue qui contredit la nature (vue unique « annoncée »,
 * flamme « bloquée ») est une forme fausse, pas un avis.
 */
export function parseCaptureNotice(metadata: unknown): CaptureNoticeMetadata | null {
  const raw = asRecord(metadata);
  if (!raw || raw.kind !== CAPTURE_NOTICE_KIND) return null;
  const actor = parseNoticeActor(raw.actor);
  if (!actor) return null;
  if (typeof raw.capturedMessageId !== 'string' || !raw.capturedMessageId) return null;
  if (!isCapturedNature(raw.nature)) return null;
  const outcome = outcomeOf(raw.nature);
  if (raw.outcome !== outcome) return null;
  if (!isCaptureKind(raw.captureKind) || !isInstant(raw.sentAt)) return null;
  return {
    kind: CAPTURE_NOTICE_KIND,
    actor,
    capturedMessageId: raw.capturedMessageId,
    nature: raw.nature,
    outcome,
    captureKind: raw.captureKind,
    sentAt: raw.sentAt,
  };
}

type Templates = {
  readonly screenshot: string;
  readonly recording: string;
  readonly blockedScreenshot: string;
  readonly blockedRecording: string;
};

const TEMPLATES: Readonly<Record<ConversationPreviewLanguage, Templates>> = {
  fr: {
    screenshot: '{actor} a capturé l’éphémère du {date} à {time}',
    recording: '{actor} a enregistré l’écran pendant l’éphémère du {date} à {time}',
    blockedScreenshot: '{actor} a tenté de capturer un message à vue unique — impossible',
    blockedRecording: '{actor} a tenté d’enregistrer un message à vue unique — impossible',
  },
  en: {
    screenshot: '{actor} took a screenshot of the disappearing message from {date} at {time}',
    recording: '{actor} recorded the screen during the disappearing message from {date} at {time}',
    blockedScreenshot: '{actor} tried to capture a view-once message — not possible',
    blockedRecording: '{actor} tried to record a view-once message — not possible',
  },
  es: {
    screenshot: '{actor} capturó el mensaje efímero del {date} a las {time}',
    recording: '{actor} grabó la pantalla durante el mensaje efímero del {date} a las {time}',
    blockedScreenshot: '{actor} intentó capturar un mensaje de visualización única — no es posible',
    blockedRecording: '{actor} intentó grabar un mensaje de visualización única — no es posible',
  },
  pt: {
    screenshot: '{actor} capturou a mensagem temporária de {date} às {time}',
    recording: '{actor} gravou a tela durante a mensagem temporária de {date} às {time}',
    blockedScreenshot: '{actor} tentou capturar uma mensagem de visualização única — não é possível',
    blockedRecording: '{actor} tentou gravar uma mensagem de visualização única — não é possível',
  },
  de: {
    screenshot: '{actor} hat einen Screenshot der verschwindenden Nachricht vom {date} um {time} gemacht',
    recording: '{actor} hat den Bildschirm während der verschwindenden Nachricht vom {date} um {time} aufgezeichnet',
    blockedScreenshot: '{actor} hat versucht, eine Einmalansicht-Nachricht aufzunehmen — nicht möglich',
    blockedRecording: '{actor} hat versucht, eine Einmalansicht-Nachricht aufzuzeichnen — nicht möglich',
  },
  it: {
    screenshot: '{actor} ha catturato il messaggio effimero del {date} alle {time}',
    recording: '{actor} ha registrato lo schermo durante il messaggio effimero del {date} alle {time}',
    blockedScreenshot: '{actor} ha tentato di catturare un messaggio a visualizzazione singola — impossibile',
    blockedRecording: '{actor} ha tentato di registrare un messaggio a visualizzazione singola — impossibile',
  },
  ar: {
    screenshot: 'التقط {actor} صورة شاشة للرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}',
    recording: 'سجّل {actor} الشاشة أثناء عرض الرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}',
    blockedScreenshot: 'حاول {actor} التقاط رسالة تُعرض مرة واحدة — غير ممكن',
    blockedRecording: 'حاول {actor} تسجيل رسالة تُعرض مرة واحدة — غير ممكن',
  },
};

function templateOf(notice: CaptureNoticeMetadata, language: ConversationPreviewLanguage): string {
  const table = TEMPLATES[language];
  if (notice.outcome === 'blocked') {
    return notice.captureKind === 'recording' ? table.blockedRecording : table.blockedScreenshot;
  }
  return notice.captureKind === 'recording' ? table.recording : table.screenshot;
}

function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function formatSentAt(sentAt: string, language: ConversationPreviewLanguage, timeZone: string): { date: string; time: string } {
  const instant = new Date(sentAt);
  const date = new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(instant);
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone }).format(instant);
  return { date, time };
}

export type CaptureNoticeReader = {
  /** Langue d'interface du lecteur ; hors catalogue ⇒ français. */
  readonly language: string | null | undefined;
  /** Fuseau IANA du lecteur ; absent ou invalide ⇒ UTC. */
  readonly timeZone: string | null | undefined;
};

/** La phrase de l'avis pour UN lecteur — sa langue, son fuseau. Pure. */
export function captureNoticeText(notice: CaptureNoticeMetadata, reader: CaptureNoticeReader): string {
  const language = normalizeConversationPreviewLanguage(reader.language);
  const { date, time } = formatSentAt(notice.sentAt, language, validTimeZone(reader.timeZone));
  const params: Readonly<Record<string, string>> = { actor: notice.actor.displayName, date, time };
  return templateOf(notice, language).replace(/\{(\w+)\}/g, (_match, token: string) => params[token] ?? '');
}

/**
 * Le texte stocké dans `Message.content` : français, heure en UTC et DITE comme
 * telle — un repli ne peut pas connaître le fuseau de son lecteur, il ne doit
 * donc pas laisser croire qu'il le connaît.
 */
export function captureNoticeFallbackText(notice: CaptureNoticeMetadata): string {
  const text = captureNoticeText(notice, { language: 'fr', timeZone: 'UTC' });
  return notice.outcome === 'blocked' ? text : `${text} (UTC)`;
}
