/**
 * @jest-environment node
 *
 * #4887, défaut 3 — « deux colonnes lourdes chargées pour rien ».
 *
 * `AttachmentService.getConversationAttachments` demandait à MongoDB
 * `transcription` (texte + segments mot-à-mot) ET `translations` (toutes les
 * langues) pour CHAQUE pièce de la page — jusqu'à 100 par appel — puis les
 * mappait, et `fast-json-stringify` les jetait : le schéma de réponse de la
 * route ne les déclare pas. Travail mort en base, sans aucun effet sur le fil
 * (au sens exact de #4177).
 *
 * CE TÉMOIN COMPTE LA REQUÊTE, PAS LA RÉPONSE. Un double Prisma rend ce qu'on
 * lui dit quel que soit le `select` : une assertion sur l'objet RENDU serait
 * verte avant comme après le retrait, et n'attesterait rien. Le seul fait
 * mesurable est l'ARGUMENT passé à `findMany` — c'est lui qui décide de ce que
 * la base lit sur le disque.
 *
 * Les fixtures portent des pièces jointes RÉELLES, transcription et
 * traductions NON VIDES : un double qui rendrait `[]` rendrait tout témoin de
 * contenu trivialement vert.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { attachmentServiceRowSelect } from '../../../../services/attachments/attachmentIncludes';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
  performanceLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AttachmentService } from '../../../../services/attachments';

const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const OWNER = '507f1f77bcf86cd799439099';

/** Les deux colonnes que la LISTE n'a aucune raison de lire. */
const HEAVY_COLUMNS = ['transcription', 'translations'] as const;

/**
 * Une pièce jointe PLEINE, telle que la base la porte : une note vocale avec
 * sa transcription mot-à-mot et deux pistes traduites. Si le service demandait
 * encore les colonnes lourdes, il les trouverait ici.
 */
function makeVoiceRow(id: string) {
  return {
    id,
    messageId: '507f1f77bcf86cd799439044',
    fileName: `${id}.m4a`,
    originalName: 'Note vocale.m4a',
    mimeType: 'audio/mp4',
    fileSize: 84213,
    fileUrl: `https://cdn.example.com/${id}.m4a`,
    thumbnailUrl: `https://cdn.example.com/${id}.png`,
    width: null,
    height: null,
    duration: 12480,
    bitrate: 64000,
    sampleRate: 48000,
    codec: 'aac',
    channels: 1,
    uploadedBy: OWNER,
    isAnonymous: false,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    isForwarded: false,
    capturedInApp: true,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 3,
    downloadedCount: 1,
    consumedCount: 2,
    isEncrypted: false,
    transcription: {
      type: 'audio',
      text: 'La réunion est déplacée à quinze heures.',
      language: 'fr',
      confidence: 0.94,
      source: 'whisper',
      durationMs: 12480,
      segments: [
        { text: 'La réunion', startMs: 0, endMs: 620, speakerId: 's0', confidence: 0.97 },
        { text: 'est déplacée', startMs: 620, endMs: 1480, speakerId: 's0', confidence: 0.95 },
        { text: 'à quinze heures.', startMs: 1480, endMs: 2600, speakerId: 's0', confidence: 0.91 },
      ],
    },
    translations: {
      en: { type: 'audio', transcription: 'The meeting has moved to three p.m.', url: 'https://cdn.example.com/x.en.mp3', createdAt: '2026-09-01T10:00:30.000Z' },
      es: { type: 'audio', transcription: 'La reunión se ha movido a las tres.', url: 'https://cdn.example.com/x.es.mp3', createdAt: '2026-09-01T10:00:35.000Z' },
    },
  };
}

function makeService(rows: ReturnType<typeof makeVoiceRow>[]) {
  const findMany = jest.fn(async () => rows) as jest.Mock<any>;
  const prisma = {
    messageAttachment: { findMany },
  } as unknown as PrismaClient;
  return { service: new AttachmentService(prisma), findMany };
}

const selectOf = (findMany: jest.Mock<any>) =>
  (findMany.mock.calls[0]?.[0] as { select?: Record<string, unknown> })?.select ?? {};

describe('AttachmentService.getConversationAttachments — ce que la REQUÊTE demande', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ne demande NI transcription NI translations à la base', async () => {
    const { service, findMany } = makeService([makeVoiceRow('att-1')]);

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 100 });

    const select = selectOf(findMany);
    for (const column of HEAVY_COLUMNS) {
      expect(select).not.toHaveProperty(column);
    }
  });

  it('lit EXACTEMENT `attachmentServiceRowSelect` — le contrat de `toAttachment`', async () => {
    // La liste et `getAttachment` chargent désormais la MÊME projection, et
    // c'est la seule qui existe : deux `select` recopiés à la main dérivent, un
    // seul ne peut pas. #4166 avait établi cette forme ; la liste l'ignorait.
    const { service, findMany } = makeService([makeVoiceRow('att-1')]);

    await service.getConversationAttachments(CONVERSATION_ID, { limit: 100 });

    expect(selectOf(findMany)).toEqual(attachmentServiceRowSelect);
  });

  it('sert quand même les treize champs de la galerie — le retrait ne coupe rien', async () => {
    // Le retrait porte sur ce que la BASE lit, pas sur ce que la galerie voit :
    // les six champs de l'arbitrage #4887 (critère 2) sortent intacts.
    const { service } = makeService([makeVoiceRow('att-1')]);

    const [attachment] = await service.getConversationAttachments(CONVERSATION_ID, { limit: 100 });

    expect(attachment).toMatchObject({
      id: 'att-1',
      messageId: '507f1f77bcf86cd799439044',
      originalName: 'Note vocale.m4a',
      uploadedBy: OWNER,
      createdAt: '2026-09-01T10:00:00.000Z',
      duration: 12480,
    });
  });

  it('ne fait plus voyager transcription ni translations hors du service', async () => {
    // Corollaire du retrait : ce que la méthode REND n'en porte plus la trace,
    // même si un appelant futur voulait les lire — il devra passer par le
    // DÉTAIL (`getAttachmentWithMetadata`), qui est fait pour ça.
    const { service } = makeService([makeVoiceRow('att-1')]);

    const [attachment] = await service.getConversationAttachments(CONVERSATION_ID, { limit: 100 });

    for (const column of [...HEAVY_COLUMNS, 'translatedAudios']) {
      expect(attachment).not.toHaveProperty(column);
    }
  });

  it("borne la page et n'invente aucun filtre — la conversation et la tombstone restent posées APRÈS le filtre de l'appelant", async () => {
    const { service, findMany } = makeService([]);

    await service.getConversationAttachments(CONVERSATION_ID, {
      limit: 100,
      offset: 20,
      messageFilter: { createdAt: { gte: new Date('2026-06-15T00:00:00Z') } },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 20,
        orderBy: { createdAt: 'desc' },
        where: {
          message: {
            createdAt: { gte: new Date('2026-06-15T00:00:00Z') },
            conversationId: CONVERSATION_ID,
            deletedAt: null,
          },
        },
      })
    );
  });
});
