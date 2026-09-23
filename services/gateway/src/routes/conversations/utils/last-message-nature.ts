import { resolveLastMessageSummaryKind } from '@meeshy/shared/utils/last-message-protection';
import { parseJoinNotice } from '@meeshy/shared/utils/join-notice';
import type {
  LastMessageAttachmentSummary,
  LastMessageCallSummary,
  LastMessageSystemEvent,
  PreviewAttachmentKind,
  PreviewProtection,
} from '@meeshy/shared/types/conversation-preview';

/**
 * La NATURE du dernier message d'une conversation (#7545) — ce que la ligne de
 * liste doit savoir du message au-delà de son texte, calculé UNE fois pour
 * `GET /conversations` (`core-list.ts`) et pour les trois émetteurs de
 * `conversation:updated` (`socketio/utils/lastMessagePreviewGroup.ts`).
 *
 * Tout ici est pur : aucune I/O, l'horloge est injectée.
 */

export interface PreviewProtectionFlags {
  readonly isBlurred?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly isEncrypted?: boolean | null;
  readonly expiresAt?: Date | string | null;
  readonly ephemeralDuration?: number | null;
}

const WITHHOLDING: ReadonlySet<PreviewProtection> = new Set(['expired', 'view-once', 'blurred', 'encrypted']);

/**
 * La protection qui qualifie l'aperçu, dans l'ordre du cumul d'effets validé
 * (#7546) : expiré > vue unique > flou > chiffré > éphémère.
 *
 * La péremption se juge par `resolveLastMessageSummaryKind`, la loi partagée
 * avec iOS, `ephemeralDuration` COMPRIS : pour un éphémère, `expiresAt` est
 * l'heure interne de destruction, jamais l'échéance du lecteur (#7451) — sans
 * elle, un éphémère se rendait « expiré » ou « actif » selon une horloge qui
 * n'est pas la sienne.
 */
export function resolvePreviewProtection(
  flags: PreviewProtectionFlags,
  now: Date = new Date(),
): PreviewProtection | null {
  const kind = resolveLastMessageSummaryKind(
    {
      isBlurred: flags.isBlurred,
      isViewOnce: flags.isViewOnce,
      expiresAt: flags.expiresAt,
      ephemeralDuration: flags.ephemeralDuration,
    },
    now,
  );
  if (kind === 'expired') return 'expired';
  if (flags.isViewOnce === true) return 'view-once';
  if (flags.isBlurred === true) return 'blurred';
  if (flags.isEncrypted === true) return 'encrypted';
  if (kind === 'ephemeralActive') return 'ephemeral';
  return null;
}

/** `true` quand ni le texte, ni les traductions, ni les pièces jointes ne doivent partir. */
export function isPreviewWithheld(protection: PreviewProtection | null): boolean {
  return protection !== null && WITHHOLDING.has(protection);
}

export function previewAttachmentKind(mimeType: string | null | undefined): PreviewAttachmentKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export interface SummarizableAttachment {
  readonly mimeType?: string | null;
  readonly fileSize?: number | null;
}

/**
 * Le résumé de TOUTES les pièces jointes. `totalCount` (le `_count` Prisma)
 * l'emporte sur la longueur de la liste quand la lecture a été bornée ; les
 * familles et le poids se lisent sur ce qui a été chargé.
 */
export function summarizeAttachments(
  attachments: readonly SummarizableAttachment[],
  totalCount?: number | null,
): LastMessageAttachmentSummary | null {
  const count = Math.max(totalCount ?? 0, attachments.length);
  if (count === 0) return null;
  const kinds = attachments.reduce<Partial<Record<PreviewAttachmentKind, number>>>((acc, attachment) => {
    const kind = previewAttachmentKind(attachment.mimeType);
    return { ...acc, [kind]: (acc[kind] ?? 0) + 1 };
  }, {});
  const sizes = attachments
    .map((attachment) => attachment.fileSize)
    .filter((size): size is number => typeof size === 'number' && Number.isFinite(size) && size >= 0);
  return {
    count,
    kinds,
    totalSize: sizes.length === 0 ? null : sizes.reduce((sum, size) => sum + size, 0),
  };
}

const CALL_OUTCOMES: ReadonlySet<string> = new Set(['completed', 'missed', 'rejected', 'failed']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Lit `Message.metadata` comme une synthèse d'appel (`CallSummaryMetadata`,
 * `utils/call-summary.ts`), ou rend `null`. Valide plutôt que caste : la
 * colonne est un JSON libre partagé par plusieurs familles de messages.
 */
export function callSummaryFromMetadata(metadata: unknown): LastMessageCallSummary | null {
  const raw = asRecord(metadata);
  if (!raw || (raw.kind !== 'call' && raw.kind !== 'call-live')) return null;
  if (typeof raw.callId !== 'string' || typeof raw.initiatorId !== 'string') return null;
  const outcome = raw.kind === 'call-live' ? 'ongoing' : raw.outcome;
  if (outcome !== 'ongoing' && (typeof outcome !== 'string' || !CALL_OUTCOMES.has(outcome))) return null;
  const duration = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds)
    ? Math.max(0, Math.floor(raw.durationSeconds))
    : 0;
  return {
    callId: raw.callId,
    kind: raw.callType === 'video' ? 'video' : 'audio',
    outcome: outcome as LastMessageCallSummary['outcome'],
    durationSec: duration,
    initiatorId: raw.initiatorId,
    endedByInitiator: raw.endedByInitiator === true,
  };
}

const ENCRYPTION_MODES: ReadonlySet<string> = new Set(['e2ee', 'server', 'hybrid']);

export interface SystemEventSource {
  readonly messageType?: string | null;
  readonly messageSource?: string | null;
  readonly metadata?: unknown;
}

function isSystemMessage(message: SystemEventSource): boolean {
  return message.messageType === 'system' || message.messageSource === 'system';
}

/**
 * L'événement système localisable d'un message système, ou `null` pour un
 * message ordinaire ou une synthèse d'appel (portée par `callSummary`). Jamais
 * le texte français stocké dans `content`.
 */
export function systemEventFromMessage(message: SystemEventSource): LastMessageSystemEvent | null {
  if (!isSystemMessage(message)) return null;
  if (callSummaryFromMetadata(message.metadata)) return null;
  const joinNotice = parseJoinNotice(message.metadata);
  if (joinNotice) return { key: 'system.member-joined', params: { name: joinNotice.displayName } };
  const raw = asRecord(message.metadata);
  if (raw?.kind === 'encryption-enabled' && typeof raw.mode === 'string' && ENCRYPTION_MODES.has(raw.mode)) {
    return { key: 'system.encryption-enabled', params: { mode: raw.mode } };
  }
  return { key: 'system.generic', params: {} };
}
