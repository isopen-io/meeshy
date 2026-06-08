/**
 * Canonical serializer for a `MessageAttachment` over Socket.IO.
 *
 * The shape mirrors `attachmentMediaSelect` (cf.
 * `services/attachments/attachmentIncludes.ts`) — the render-ready set
 * that already includes the Prisme Linguistique JSON pair
 * (`transcription`, `translations`). Use this helper everywhere a
 * Message attachment is broadcast to clients so socket payloads stay
 * at parity with the REST `/messages` payload.
 *
 * The input is intentionally typed loosely (`Record<string, unknown>`)
 * because call sites may have queried Prisma with either
 * `attachments: true` (full row) or
 * `attachments: { select: attachmentMediaSelect }`. Both produce a
 * superset of the required fields ; we pick what we need and let
 * TypeScript infer the rest.
 *
 * Replaces scattered `(message as any).attachments` casts that silently
 * dropped `transcription` and `translations` depending on the query
 * path. See `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.
 */
export interface SocketAttachment {
  readonly id: string;
  readonly messageId: string;
  readonly fileName?: string | null;
  readonly originalName?: string | null;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string | null;
  readonly thumbHash?: string | null;
  readonly imageVariants?: unknown;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly bitrate?: number | null;
  readonly sampleRate?: number | null;
  readonly codec?: string | null;
  readonly channels?: number | null;
  readonly fps?: number | null;
  readonly videoCodec?: string | null;
  readonly pageCount?: number | null;
  readonly lineCount?: number | null;
  readonly metadata?: unknown;
  readonly uploadedBy?: string | null;
  readonly isAnonymous?: boolean | null;
  readonly createdAt: Date | string;
  readonly transcription: unknown;
  readonly translations: unknown;
}

export function serializeAttachmentForSocket(
  raw: Record<string, unknown>
): SocketAttachment {
  return {
    id: raw.id as string,
    messageId: raw.messageId as string,
    fileName: (raw.fileName as string | null | undefined) ?? null,
    originalName: (raw.originalName as string | null | undefined) ?? null,
    mimeType: raw.mimeType as string,
    fileSize: (raw.fileSize as number | undefined) ?? 0,
    fileUrl: raw.fileUrl as string,
    thumbnailUrl: (raw.thumbnailUrl as string | null | undefined) ?? null,
    thumbHash: (raw.thumbHash as string | null | undefined) ?? null,
    imageVariants: raw.imageVariants ?? null,
    width: (raw.width as number | null | undefined) ?? null,
    height: (raw.height as number | null | undefined) ?? null,
    duration: (raw.duration as number | null | undefined) ?? null,
    bitrate: (raw.bitrate as number | null | undefined) ?? null,
    sampleRate: (raw.sampleRate as number | null | undefined) ?? null,
    codec: (raw.codec as string | null | undefined) ?? null,
    channels: (raw.channels as number | null | undefined) ?? null,
    fps: (raw.fps as number | null | undefined) ?? null,
    videoCodec: (raw.videoCodec as string | null | undefined) ?? null,
    pageCount: (raw.pageCount as number | null | undefined) ?? null,
    lineCount: (raw.lineCount as number | null | undefined) ?? null,
    metadata: raw.metadata ?? null,
    uploadedBy: (raw.uploadedBy as string | null | undefined) ?? null,
    isAnonymous: (raw.isAnonymous as boolean | null | undefined) ?? null,
    createdAt: raw.createdAt as Date | string,
    // Prisme Linguistique — null = pas encore enrichi, présent = serialize tel quel
    transcription: raw.transcription ?? null,
    translations: raw.translations ?? null,
  };
}
