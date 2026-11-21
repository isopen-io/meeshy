/**
 * LE CHEMIN DISQUE INTERNE NE SORT PAS SUR LE FIL (#20048).
 *
 * `GET /attachments/:id/metadata` était le SEUL chemin du dépôt à servir
 * `MessageAttachment.filePath` — le chemin de stockage du serveur
 * (`/srv/meeshy/uploads/2026/11/<conversationId>/memo_8b1f0c1e.m4a`) — à tout
 * membre actif de la conversation, invités de lien compris. Rien d'exploitable
 * seul ; mais la racine, le partitionnement par année/mois/conversation et la
 * convention `<base>_<hash8>.<ext>` sont exactement ce qui transforme une
 * traversée de chemin, un rendu d'erreur bavard ou un accès S3 mal borné en
 * lecture CIBLÉE. De la reconnaissance offerte, et sans aucun lecteur
 * (mesuré : les quatre décodeurs d'API — web, `APIMessageAttachment` Swift,
 * `ApiMessageAttachment` Kotlin, et les deux `struct Decodable` des appelants
 * iOS de cette route — ne déclarent pas le champ).
 *
 * DEUX MOITIÉS, DEUX TÉMOINS, et il faut les deux :
 *
 *  1. le CONTRAT — `messageAttachmentSchema` déclarait `filePath`, donc
 *     `fast-json-stringify` ne le retirait pas. Ce témoin-ci traverse le vrai
 *     sérialiseur (`app.inject()`, schémas partagés NON doublés) et mesure ce
 *     qui SORT ;
 *  2. la PROJECTION — `getAttachmentWithMetadata` le CHARGEAIT. Témoin frère
 *     (`attachment-metadata-select-no-file-path.test.ts`), qui assert sur la
 *     REQUÊTE : un double Prisma rend ce qu'on lui dit quel que soit le
 *     `select`, donc aucun témoin de comportement ne peut voir cette moitié.
 *
 * Les deux, parce que le dépôt refuse qu'une omission de schéma tienne un
 * secret : « compter sur une omission de schéma pour retenir un secret est un
 * piège armé, pas une protection » (règle du cycle 84). Le contrat coupe
 * l'ÉMISSION tout de suite ; le `select` coupe le CHARGEMENT, pour que la
 * prochaine route qui réutilise le schéma n'ait rien à publier.
 *
 * `thumbnailPath` est gardé par le même témoin : déclaré au contrat, chargé par
 * aucun `select`, lu par personne — donc inerte aujourd'hui et armé pour
 * demain, exactement la forme que la règle du cycle 84 interdit de laisser.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: any[]) => mockGetAttachmentWithMetadata(...a),
    getAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    getConversationAttachments: jest.fn(),
  })),
}));

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-111aaa';
const PARTICIPANT_ID = 'part-333ccc';

/** Le chemin SERVEUR, écrit ici pour qu'une fuite se voie à l'œil dans le corps servi. */
const SERVER_PATH = 'attachments/2026/11/68f2a81417a557e8ce4ddfc1/memo_8b1f0c1e.m4a';
const SERVER_THUMB_PATH = 'attachments/2026/11/68f2a81417a557e8ce4ddfc1/memo_8b1f0c1e_thumb.jpg';

const MESSAGE_ID = 'msg-1';
const CONVERSATION_ID = '68f2a81417a557e8ce4ddfc1';

/** Le PORTEUR de la pièce : un message ordinaire, sans protection — la loi du
 *  contenu latéral le laisse passer, pour que ce lot ne mesure QUE le chemin. */
const CARRIER = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: USER_ID,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  encryptionMode: null,
  isEncrypted: false,
  deletedAt: null,
  createdAt: new Date('2026-11-21T00:00:00Z'),
};

const makePrisma = () => ({
  message: {
    findUnique: jest.fn<any>().mockResolvedValue(CARRIER),
    findFirst: jest.fn<any>().mockResolvedValue(CARRIER),
    findMany: jest.fn<any>().mockResolvedValue([CARRIER]),
  },
  messageAttachment: {
    findMany: jest.fn<any>().mockResolvedValue([{ id: ATTACHMENT_ID, isViewOnce: false, isBlurred: false, effectFlags: 0 }]),
  },
  messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID, conversationId: CONVERSATION_ID, joinedAt: new Date(0), shareLinkId: null, permissions: null }),
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
  conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authOptional = async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      type: 'registered',
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  await registerMetadataRoutes(app, authOptional, makePrisma() as any);
  await app.ready();
  return app;
}

describe('GET /attachments/:id/metadata — le chemin disque du serveur ne part pas', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const servedBody = async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue({
      id: ATTACHMENT_ID,
      messageId: MESSAGE_ID,
      fileName: 'memo_8b1f0c1e.m4a',
      originalName: 'memo.m4a',
      mimeType: 'audio/mp4',
      fileSize: 20_480,
      fileUrl: `/api/v1/files/${ATTACHMENT_ID}`,
      filePath: SERVER_PATH,
      thumbnailPath: SERVER_THUMB_PATH,
      duration: 12_000,
      uploadedBy: USER_ID,
      isAnonymous: false,
      updatedAt: new Date('2026-11-21T00:00:00Z'),
      createdAt: new Date('2026-11-21T00:00:00Z'),
    });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    if (res.statusCode !== 200) throw new Error(`statut ${res.statusCode} — ${res.body}`);
    return res;
  };

  it('ne sert pas `filePath`, même quand le service le rend', async () => {
    const res = await servedBody();
    expect(res.json().data.attachment).not.toHaveProperty('filePath');
  });

  it('ne sert pas `thumbnailPath` non plus', async () => {
    const res = await servedBody();
    expect(res.json().data.attachment).not.toHaveProperty('thumbnailPath');
  });

  /**
   * Le témoin qui se lit à l'œil : aucune des deux chaînes de chemin SERVEUR
   * n'apparaît dans le corps, à quelque profondeur que ce soit. Il attrape ce
   * que `not.toHaveProperty` manque — un chemin recopié sous un AUTRE nom de
   * clé, ou imbriqué dans un objet voisin.
   */
  it('ne laisse aucune trace du chemin serveur dans le corps servi', async () => {
    const res = await servedBody();
    expect(res.body).not.toContain(SERVER_PATH);
    expect(res.body).not.toContain(SERVER_THUMB_PATH);
  });

  /** Ce que la route DOIT continuer de servir — un retrait trop large se verrait ici. */
  it('sert toujours l’adresse publique et les métadonnées du média', async () => {
    const res = await servedBody();
    const attachment = res.json().data.attachment;
    expect(attachment.fileUrl).toBe(`/api/v1/files/${ATTACHMENT_ID}`);
    expect(attachment.fileName).toBe('memo_8b1f0c1e.m4a');
    expect(attachment.mimeType).toBe('audio/mp4');
    expect(attachment.fileSize).toBe(20_480);
  });
});
