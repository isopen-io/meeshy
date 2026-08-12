import {
  attachmentMediaSelect,
  attachmentFullSelect,
  attachmentForwardPreviewSelect,
} from '../attachmentIncludes';
import { messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';

describe('attachments/attachmentIncludes — canonical shared selects', () => {
  describe('Fastify schema alignment (R5)', () => {
    // Fastify silently strips response fields not declared in the response
    // schema. Pre-R5, attachmentFullSelect requested 7 fields that the schema
    // didn't declare (consumedCount, effectFlags, listenedByAllAt,
    // watchedByAllAt, encryptionMode, encryptionIv, encryptionAuthTag) —
    // gateway burnt DB I/O for fields that never reached the wire, and E2EE
    // clients couldn't decrypt attachments served by routes that applied
    // messageAttachmentSchema as their response shape. This test guards
    // against future omissions.
    const schemaKeys = new Set(Object.keys(messageAttachmentSchema.properties));

    // Fields fetched from DB for server-side aggregation only — intentionally
    // absent from messageAttachmentSchema because they are transformed before
    // serialization. BUG2 A': raw reactions → reactionSummary + currentUserReactions.
    const INTERNAL_AGGREGATION_FIELDS = new Set(['reactions']);

    it('attachmentMediaSelect ⊆ messageAttachmentSchema.properties', () => {
      const missing = Object.keys(attachmentMediaSelect)
        .filter((k) => !INTERNAL_AGGREGATION_FIELDS.has(k))
        .filter((k) => !schemaKeys.has(k));
      expect(missing).toEqual([]);
    });

    it('attachmentFullSelect ⊆ messageAttachmentSchema.properties (no stripped fields)', () => {
      const missing = Object.keys(attachmentFullSelect)
        .filter((k) => !INTERNAL_AGGREGATION_FIELDS.has(k))
        .filter((k) => !schemaKeys.has(k));
      expect(missing).toEqual([]);
    });

    it('reactions aggregation output fields declared in schema (reactionSummary + currentUserReactions)', () => {
      // The raw reactions relation is aggregated server-side; the wire format sends
      // reactionSummary and currentUserReactions. Guard against accidentally removing them.
      expect(schemaKeys.has('reactionSummary')).toBe(true);
      expect(schemaKeys.has('currentUserReactions')).toBe(true);
    });

    it('attachmentForwardPreviewSelect ⊆ messageAttachmentSchema.properties', () => {
      const missing = Object.keys(attachmentForwardPreviewSelect).filter(
        (k) => !schemaKeys.has(k),
      );
      expect(missing).toEqual([]);
    });

    it('messageAttachmentSchema explicitly declares the E2EE envelope', () => {
      // These fields are mandatory for any E2EE-capable client. Removing
      // them from the schema would silently break attachment decryption.
      for (const f of ['encryptionMode', 'encryptionIv', 'encryptionAuthTag', 'isEncrypted']) {
        expect(messageAttachmentSchema.properties).toHaveProperty(f);
      }
    });

    it('messageAttachmentSchema explicitly declares the denormalized counters', () => {
      for (const f of [
        'viewedCount',
        'downloadedCount',
        'consumedCount',
        'listenedByAllAt',
        'watchedByAllAt',
      ]) {
        expect(messageAttachmentSchema.properties).toHaveProperty(f);
      }
    });
  });

  describe('attachmentMediaSelect — Prisme Linguistique guarantees', () => {
    it('includes transcription + translations (the two Prisme JSON fields)', () => {
      // R4 closed five concurrent drifts where these were silently dropped
      // from link previews, notifications, admin content, the message edit
      // endpoint, and thread parent responses. Locking them in here stops
      // a future field-trimming refactor from regressing the bug.
      expect(attachmentMediaSelect).toEqual(
        expect.objectContaining({
          transcription: true,
          translations: true,
        }),
      );
    });

    it('keeps the full file + audio/video codec set', () => {
      expect(attachmentMediaSelect).toEqual(
        expect.objectContaining({
          id: true,
          messageId: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          thumbnailUrl: true,
          thumbHash: true,
          imageVariants: true,
          width: true,
          height: true,
          duration: true,
          bitrate: true,
          sampleRate: true,
          codec: true,
          channels: true,
          fps: true,
          videoCodec: true,
          pageCount: true,
          lineCount: true,
          metadata: true,
          uploadedBy: true,
          isAnonymous: true,
          createdAt: true,
        }),
      );
    });

    it('includes per-image reaction aggregation select (BUG2 guard)', () => {
      // BUG2 A' — reactions added to media select to support per-image aggregation
      // (emoji + participantId needed for reactionSummary + currentUserReactions mapping).
      // Uses nested Prisma select (not boolean true) because reactions is a relation.
      expect(attachmentMediaSelect).toHaveProperty('reactions', {
        select: { emoji: true, participantId: true },
      });
    });

    it('selects exactly 28 documented fields — guards against silent omission', () => {
      const expectedKeys = [
        'id',
        'messageId',
        'fileName',
        'originalName',
        'mimeType',
        'fileSize',
        'fileUrl',
        'thumbnailUrl',
        'thumbHash',
        'imageVariants',
        'width',
        'height',
        'duration',
        'bitrate',
        'sampleRate',
        'codec',
        'channels',
        'fps',
        'videoCodec',
        'pageCount',
        'lineCount',
        'metadata',
        'uploadedBy',
        'isAnonymous',
        'createdAt',
        'transcription',
        'translations',
        'reactions',
      ];
      expect(Object.keys(attachmentMediaSelect).sort()).toEqual(expectedKeys.sort());
      expect(Object.keys(attachmentMediaSelect)).toHaveLength(28);
    });
  });

  describe('attachmentFullSelect — render + consumption tracking + security', () => {
    it('is a superset of attachmentMediaSelect', () => {
      // Check each key from attachmentMediaSelect is present in attachmentFullSelect
      // with the same value (true for scalar fields, nested select for relations).
      for (const key of Object.keys(attachmentMediaSelect)) {
        const srcValue = (attachmentMediaSelect as Record<string, unknown>)[key];
        expect(attachmentFullSelect).toHaveProperty(key, srcValue);
      }
    });

    it('adds the denormalized consumption counters', () => {
      expect(attachmentFullSelect).toEqual(
        expect.objectContaining({
          deliveredToAllAt: true,
          viewedByAllAt: true,
          downloadedByAllAt: true,
          listenedByAllAt: true,
          watchedByAllAt: true,
          viewedCount: true,
          downloadedCount: true,
          consumedCount: true,
        }),
      );
    });

    it('adds the forwarding + view-once + blur + effect flags', () => {
      expect(attachmentFullSelect).toEqual(
        expect.objectContaining({
          forwardedFromAttachmentId: true,
          isForwarded: true,
          isViewOnce: true,
          maxViewOnceCount: true,
          viewOnceCount: true,
          isBlurred: true,
          effectFlags: true,
        }),
      );
    });

    it('adds the encryption envelope fields', () => {
      expect(attachmentFullSelect).toEqual(
        expect.objectContaining({
          isEncrypted: true,
          encryptionMode: true,
          encryptionIv: true,
          encryptionAuthTag: true,
        }),
      );
    });

    it('preserves Prisme fields through the superset spread', () => {
      // Defensive — ensures the spread operator didn't accidentally
      // drop transcription/translations during a future refactor.
      expect(attachmentFullSelect.transcription).toBe(true);
      expect(attachmentFullSelect.translations).toBe(true);
    });
  });

  describe('attachmentForwardPreviewSelect', () => {
    it('exposes only the four fields needed for a forward chip', () => {
      expect(attachmentForwardPreviewSelect).toEqual({
        id: true,
        mimeType: true,
        thumbnailUrl: true,
        fileUrl: true,
      });
    });

    it('intentionally omits transcription + translations — chips are not players', () => {
      // The user taps a forward chip to navigate to the full message,
      // where the player uses attachmentMediaSelect / attachmentFullSelect.
      // Pulling JSON Prisme blobs here would bloat every forward preview
      // for no rendering gain.
      expect(attachmentForwardPreviewSelect).not.toHaveProperty('transcription');
      expect(attachmentForwardPreviewSelect).not.toHaveProperty('translations');
    });
  });
});
