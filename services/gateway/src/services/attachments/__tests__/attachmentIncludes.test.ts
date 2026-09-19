import {
  attachmentMediaSelect,
  attachmentFullSelect,
  attachmentForwardPreviewSelect,
  attachmentSocketSelect,
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

    /**
     * #7070 — jumeau de la garde ci-dessus, pour la forme du CANAL SOCKET.
     * Sinon `GET /messages` et `GET /sync` (qui appliquent `messageAttachmentSchema`
     * en réponse) SERVIRAIENT moins que `message:new`/`message:edited` sur le
     * MÊME `select` — la divergence inverse de celle que #7070 ferme.
     */
    it('attachmentSocketSelect ⊆ messageAttachmentSchema.properties', () => {
      const missing = Object.keys(attachmentSocketSelect)
        .filter((k) => !INTERNAL_AGGREGATION_FIELDS.has(k))
        .filter((k) => !schemaKeys.has(k));
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

    it('includes capturedInApp — la provenance voyage avec le média, pas à côté', () => {
      // La feuille de partage propose de PUBLIER une pièce jointe reçue, et une
      // capture (caméra/micro de l'app) n'a encore été vue par personne :
      // l'ouvrir à un fil entier se confirme. Cette confirmation lit le drapeau
      // sur l'attachement que la LISTE de messages a livré — pas sur une
      // requête de détail. Absent d'ici, le drapeau est indéfini côté client et
      // la garde ne se déclenche JAMAIS.
      expect(attachmentMediaSelect).toEqual(
        expect.objectContaining({ capturedInApp: true }),
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

    it('selects exactly 29 documented fields — guards against silent omission', () => {
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
        'capturedInApp',
        'reactions',
      ];
      expect(Object.keys(attachmentMediaSelect).sort()).toEqual(expectedKeys.sort());
      expect(Object.keys(attachmentMediaSelect)).toHaveLength(29);
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

  describe('attachmentSocketSelect — la forme du canal socket, étendue (#7070)', () => {
    it('est un superset de attachmentMediaSelect et attachmentProtectionSelect', () => {
      for (const key of Object.keys(attachmentMediaSelect)) {
        expect(attachmentSocketSelect).toHaveProperty(
          key,
          (attachmentMediaSelect as Record<string, unknown>)[key],
        );
      }
    });

    it('porte les CINQ familles que #7070 a trouvées absentes du chemin REST/ZMQ', () => {
      expect(attachmentSocketSelect).toEqual(
        expect.objectContaining({
          // protection (#7014, déjà là)
          isViewOnce: true,
          isBlurred: true,
          effectFlags: true,
          // forwarding
          forwardedFromAttachmentId: true,
          isForwarded: true,
          // effets de vue-unique
          maxViewOnceCount: true,
          viewOnceCount: true,
          // consommation
          deliveredToAllAt: true,
          viewedByAllAt: true,
          downloadedByAllAt: true,
          listenedByAllAt: true,
          watchedByAllAt: true,
          viewedCount: true,
          downloadedCount: true,
          consumedCount: true,
          // fait + mode du chiffrement (jamais l'enveloppe)
          isEncrypted: true,
          encryptionMode: true,
        }),
      );
    });

    it("N'AJOUTE PAS l'enveloppe de chiffrement — secret de serveur, pas de fil (#7070)", () => {
      expect(attachmentSocketSelect).not.toHaveProperty('encryptionIv');
      expect(attachmentSocketSelect).not.toHaveProperty('encryptionAuthTag');
      expect(attachmentSocketSelect).not.toHaveProperty('filePath');
    });

    /**
     * LE CLIQUET DE DÉRIVE, et la raison pour laquelle il n'est pas remplacé
     * par une dérivation.
     *
     * Mesuré après #7070 : `attachmentSocketSelect` est EXACTEMENT
     * `attachmentFullSelect` moins l'enveloppe de chiffrement — deux listes
     * de colonnes tenues À LA MAIN, dans le MÊME fichier, à trente lignes
     * l'une de l'autre. Les deux témoins ci-dessus n'énumèrent que les cinq
     * familles de ce lot : une SIXIÈME ajoutée demain à `attachmentFullSelect`
     * (une ligne, un endpoint de détail) n'atteindrait pas le fil, et aucun
     * témoin ne rougirait — « un relais qui RECOPIE champ par champ est un
     * inventaire à tenir à jour, et il ne l'est jamais » (doc-comment du
     * sérialiseur).
     *
     * Écrire `socket = full − enveloppe` en CODE aurait fermé la dérive dans
     * le mauvais sens : un secret de serveur ajouté un jour à
     * `attachmentFullSelect` aurait alors atteint la room toute entière sans
     * un mot. Le cliquet, lui, est FAIL-CLOSED : il ne laisse rien fuir, il
     * exige seulement qu'un humain tranche à quel canal appartient la
     * nouvelle colonne — et nomme la colonne en défaut dans son échec.
     */
    it('ne DÉRIVE pas de attachmentFullSelect en silence — tout écart est NOMMÉ (#7070)', () => {
      const ENVELOPPE_SERVEUR = ['encryptionIv', 'encryptionAuthTag'];
      const clesSocket = new Set(Object.keys(attachmentSocketSelect));
      const clesCompletes = new Set(Object.keys(attachmentFullSelect));

      expect({
        absentesDuFil: [...clesCompletes].filter((k) => !clesSocket.has(k)).sort(),
        absentesDuDetail: [...clesSocket].filter((k) => !clesCompletes.has(k)).sort(),
      }).toEqual({
        absentesDuFil: [...ENVELOPPE_SERVEUR].sort(),
        absentesDuDetail: [],
      });
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
