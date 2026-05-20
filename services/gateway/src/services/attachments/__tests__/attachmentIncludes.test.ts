import {
  attachmentMediaSelect,
  attachmentFullSelect,
  attachmentForwardPreviewSelect,
} from '../attachmentIncludes';

describe('attachments/attachmentIncludes — canonical shared selects', () => {
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

    it('selects exactly 26 documented fields — guards against silent omission', () => {
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
      ];
      expect(Object.keys(attachmentMediaSelect).sort()).toEqual(expectedKeys.sort());
      expect(Object.keys(attachmentMediaSelect)).toHaveLength(26);
    });
  });

  describe('attachmentFullSelect — render + consumption tracking + security', () => {
    it('is a superset of attachmentMediaSelect', () => {
      for (const key of Object.keys(attachmentMediaSelect)) {
        expect(attachmentFullSelect).toHaveProperty(key, true);
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
