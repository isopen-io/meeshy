import {
  MessageParamsSchema,
  AttachmentParamsSchema,
  MessageStatusDetailsQuerySchema,
  AttachmentStatusDetailsQuerySchema,
  UpdateMessageBodySchema,
  MessageStatusBodySchema,
  AttachmentStatusBodySchema,
  MarkReadBodySchema,
} from '../../../validation/messages-schemas';
import { MAX_CONTENT_BYTES } from '../../../validation/content-limits';

const VALID_OID = '507f1f77bcf86cd799439011';

describe('MessageParamsSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID }).success).toBe(true);
  });

  it('rejects a non-hex id', () => {
    expect(MessageParamsSchema.safeParse({ messageId: 'not-valid-objectid-1234' }).success).toBe(false);
  });

  it('rejects a 23-char id', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID.slice(1) }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('AttachmentParamsSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: VALID_OID }).success).toBe(true);
  });

  it('rejects an invalid ObjectId', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: 'bad-id' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('MessageStatusDetailsQuerySchema', () => {
  it('uses defaults when empty object given', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(20);
      expect(result.data.filter).toBe('all');
    }
  });

  it('parses valid string offset and limit', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ offset: '5', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(5);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects offset = -1', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('rejects limit = 0 (below min)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit = 101 (above max)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('accepts limit = 100 (boundary)', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ limit: '100' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });

  it('accepts filter = "delivered"', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ filter: 'delivered' });
    expect(result.success).toBe(true);
  });

  it('accepts filter = "read"', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'read' }).success).toBe(true);
  });

  it('accepts filter = "unread"', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'unread' }).success).toBe(true);
  });

  it('rejects unknown filter value', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'pending' }).success).toBe(false);
  });

  it('rejects non-numeric offset string', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ offset: 'abc' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe('AttachmentStatusDetailsQuerySchema', () => {
  it('uses defaults when empty object given', () => {
    const result = AttachmentStatusDetailsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(20);
      expect(result.data.filter).toBe('all');
    }
  });

  it('accepts filter = "viewed"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'viewed' }).success).toBe(true);
  });

  it('accepts filter = "downloaded"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'downloaded' }).success).toBe(true);
  });

  it('accepts filter = "listened"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'listened' }).success).toBe(true);
  });

  it('accepts filter = "watched"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'watched' }).success).toBe(true);
  });

  it('rejects unknown filter value', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'read' }).success).toBe(false);
  });

  it('rejects limit above 100', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects negative offset', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('UpdateMessageBodySchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdateMessageBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepts content only', () => {
    expect(UpdateMessageBodySchema.safeParse({ content: 'Hello' }).success).toBe(true);
  });

  it('accepts isEdited only', () => {
    expect(UpdateMessageBodySchema.safeParse({ isEdited: true }).success).toBe(true);
  });

  it('accepts both content and isEdited', () => {
    expect(UpdateMessageBodySchema.safeParse({ content: 'Hi', isEdited: true }).success).toBe(true);
  });

  it('rejects extra unknown fields (strict)', () => {
    expect(UpdateMessageBodySchema.safeParse({ extra: 'value' }).success).toBe(false);
  });

  it('rejects non-boolean isEdited', () => {
    expect(UpdateMessageBodySchema.safeParse({ isEdited: 'yes' }).success).toBe(false);
  });

  // Safety-ceiling parity with the SOCKET write transports
  // (`SocketMessageSendSchema`, `SocketMessageEditSchema`): the REST edit
  // transport `PUT /messages/:messageId` must reject a content payload that
  // exceeds `MAX_CONTENT_BYTES`. Without the cap an oversized edit is persisted
  // to Mongo and broadcast as `message:edited` to the whole conversation room —
  // the downstream guard (`messageEditContent.ts`) only rejects EMPTY content.
  it('rejects content beyond the shared safety ceiling', () => {
    expect(
      UpdateMessageBodySchema.safeParse({ content: 'x'.repeat(MAX_CONTENT_BYTES + 1) }).success
    ).toBe(false);
  });

  it('accepts content exactly at the shared safety ceiling', () => {
    expect(
      UpdateMessageBodySchema.safeParse({ content: 'x'.repeat(MAX_CONTENT_BYTES) }).success
    ).toBe(true);
  });
});

describe('MessageStatusBodySchema', () => {
  it('accepts status = "read"', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read' }).success).toBe(true);
  });

  it('accepts status = "delivered"', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'delivered' }).success).toBe(true);
  });

  it('accepts status with an ISO timestamp', () => {
    const result = MessageStatusBodySchema.safeParse({
      status: 'read',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('rejects missing status', () => {
    expect(MessageStatusBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid timestamp format', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read', timestamp: 'not-a-date' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read', extra: true }).success).toBe(false);
  });
});

describe('AttachmentStatusBodySchema', () => {
  it('accepts action = "listened"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened' }).success).toBe(true);
  });

  it('accepts action = "watched"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'watched' }).success).toBe(true);
  });

  it('accepts action = "viewed"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'viewed' }).success).toBe(true);
  });

  it('accepts action = "downloaded"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'downloaded' }).success).toBe(true);
  });

  it('accepts action with all optional fields', () => {
    const result = AttachmentStatusBodySchema.safeParse({
      action: 'listened',
      playPositionMs: 500,
      durationMs: 10000,
      complete: true,
      wasZoomed: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown action', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'played' }).success).toBe(false);
  });

  // ── Trace de l'interaction ──────────────────────────────────────────────

  it('accepte une trace d\'écoutes continues', () => {
    const result = AttachmentStatusBodySchema.safeParse({
      action: 'listened',
      stretches: [
        { startMs: 0, endMs: 500, endedBy: 'pause' },
        { startMs: 500, endMs: 900, endedBy: 'completed' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejette un motif de fin inconnu', () => {
    expect(
      AttachmentStatusBodySchema.safeParse({
        action: 'listened',
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'teleported' }],
      }).success
    ).toBe(false);
  });

  it('rejette une trace sans motif de fin', () => {
    expect(
      AttachmentStatusBodySchema.safeParse({
        action: 'listened',
        stretches: [{ startMs: 0, endMs: 500 }],
      }).success
    ).toBe(false);
  });

  it('écarte un champ inconnu d\'une écoute sans perdre l\'écoute', () => {
    // Un client d'une version ultérieure peut enrichir son rapport ; refuser le
    // tout perdrait l'écoute pour un champ décoratif.
    const result = AttachmentStatusBodySchema.safeParse({
      action: 'listened',
      stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause', speed: 1.5 }],
    });
    expect(result.success).toBe(true);
    expect((result as any).data.stretches[0]).toEqual({
      startMs: 0,
      endMs: 500,
      endedBy: 'pause',
    });
  });

  it('plafonne le nombre d\'écoutes rapportées d\'un coup', () => {
    const stretches = Array.from({ length: 51 }, (_, i) => ({
      startMs: i * 100,
      endMs: i * 100 + 50,
      endedBy: 'pause',
    }));
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', stretches }).success).toBe(false);
  });

  it('rejette une écoute dont endMs est strictement inférieur à startMs', () => {
    // Un tuple inversé serait SILENCIEUSEMENT jeté par le filtre `isUsable` en aval
    // (`services/gateway/src/utils/playback-trace.ts:78`, `endMs > startMs`) — le
    // client recevrait `200 OK` sans savoir que sa trace n'a pas été persistée.
    // Le wire miroite ce contrat pour transformer le drop muet en 400 visible.
    expect(
      AttachmentStatusBodySchema.safeParse({
        action: 'listened',
        stretches: [{ startMs: 500, endMs: 200, endedBy: 'pause' }],
      }).success
    ).toBe(false);
  });

  it('rejette une écoute de durée nulle (endMs === startMs)', () => {
    // Différent de la décision 234/236 (`>=`) : le refine est STRICT (`>`) ici parce
    // que la sémantique documentée est « une écoute réellement CONTINUE »
    // (`playback-trace.ts:7`). Une durée zéro n'est pas une écoute, et la
    // persistance la jette. Le wire aligne son verdict.
    expect(
      AttachmentStatusBodySchema.safeParse({
        action: 'listened',
        stretches: [{ startMs: 500, endMs: 500, endedBy: 'pause' }],
      }).success
    ).toBe(false);
  });

  // ── Prisme linguistique ─────────────────────────────────────────────────

  it('accepte un code de langue simple', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'fr' }).success).toBe(true);
  });

  it('accepte une locale à tiret comme à underscore', () => {
    // iOS envoie `Locale.current.identifier`, donc `fr_FR` ; refuser cette forme
    // ferait échouer tout le rapport pour un séparateur.
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'fr-FR' }).success).toBe(true);
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'fr_FR' }).success).toBe(true);
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'zh-Hant-HK' }).success).toBe(true);
  });

  it('accepte un code 3-lettres', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'bas' }).success).toBe(true);
  });

  it('rejette ce qui n\'a pas la forme d\'une langue', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'f' }).success).toBe(false);
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: '@@' }).success).toBe(false);
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', language: 'frenchy-language' }).success).toBe(false);
  });

  it('rejects missing action', () => {
    expect(AttachmentStatusBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects negative playPositionMs', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: -1 }).success).toBe(false);
  });

  it('accepts zero playPositionMs (boundary)', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: 0 }).success).toBe(true);
  });

  it('rejects non-integer playPositionMs', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: 1.5 }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', extra: true }).success).toBe(false);
  });
});

describe('MarkReadBodySchema', () => {
  // Le corps reste OPTIONNEL côté route : les binaires déjà distribués n'en
  // envoient pas, et les priver du repli perdrait toute lecture.
  // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md

  it('accepte un corps vide', () => {
    expect(MarkReadBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepte la liste des messages réellement affichés', () => {
    expect(MarkReadBodySchema.safeParse({ messageIds: [VALID_OID] }).success).toBe(true);
  });

  it('accepte une liste VIDE — « rien n\'a défilé » est une information', () => {
    expect(MarkReadBodySchema.safeParse({ messageIds: [] }).success).toBe(true);
  });

  it('rejette un identifiant qui n\'en est pas un', () => {
    expect(MarkReadBodySchema.safeParse({ messageIds: ['nope'] }).success).toBe(false);
  });

  it('plafonne la taille du lot', () => {
    const tooMany = Array.from({ length: 201 }, () => VALID_OID);
    expect(MarkReadBodySchema.safeParse({ messageIds: tooMany }).success).toBe(false);
  });

  it('accepte la langue affichée pendant que le lot défilait', () => {
    expect(MarkReadBodySchema.safeParse({ messageIds: [VALID_OID], language: 'en' }).success).toBe(true);
    expect(MarkReadBodySchema.safeParse({ language: 'fr_FR' }).success).toBe(true);
  });

  it('rejette une langue malformée', () => {
    expect(MarkReadBodySchema.safeParse({ language: '@@' }).success).toBe(false);
  });

  it('accepte les exceptions par message', () => {
    expect(
      MarkReadBodySchema.safeParse({
        messageIds: [VALID_OID],
        language: 'en',
        messageLanguages: { [VALID_OID]: 'fr' },
      }).success
    ).toBe(true);
  });

  it('rejette une clé qui n\'est pas un identifiant de message', () => {
    expect(MarkReadBodySchema.safeParse({ messageLanguages: { nope: 'fr' } }).success).toBe(false);
  });

  it('rejette une langue d\'exception malformée', () => {
    expect(MarkReadBodySchema.safeParse({ messageLanguages: { [VALID_OID]: '@@' } }).success).toBe(false);
  });

  it('rejette un champ inconnu (strict)', () => {
    expect(MarkReadBodySchema.safeParse({ extra: true }).success).toBe(false);
  });
});
