/**
 * Témoin d'audit (#10789, #13101) sur un VRAI mongod 8.0.4 (`AUDIT_MONGO_URL`, rs0) :
 * un blob e2ee téléversé puis jamais envoyé doit être balayé par le ménage
 * des pièces orphelines (24 h), comme toute pièce non rattachée.
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { storeEndToEndBlob } from '../endToEndBlobUpload';
import { MaintenanceService } from '../../MaintenanceService';

// Le vrai client généré : `jest.config.json` remplace `@meeshy/shared/prisma/client` par un stub.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require(path.resolve(__dirname, '../../../../../../packages/shared/prisma/client/index.js'));

const MONGO = process.env.AUDIT_MONGO_URL ?? '';

const run = process.env.AUDIT_MONGO_URL ? describe : describe.skip;

run('audit #10789 — un blob e2ee abandonné est balayé à 24 h', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: MONGO } } });
  afterAll(() => prisma.$disconnect());

  it('le ménage des orphelins supprime le blob comme la pièce ordinaire', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2ee-sweep-'));
    const source = path.join(dir, 'tus-upload');
    const blob = Buffer.alloc(592, 7);
    await fs.writeFile(source, blob);
    const digest = createHash('sha256').update(blob).digest('base64');
    const userId = '507f1f77bcf86cd799439011';

    const stored = await storeEndToEndBlob({ prisma, uploadPath: dir }, {
      sourcePath: source,
      metadata: { uploadcontext: 'e2ee-attachment', digest, filetype: 'application/octet-stream', filename: 'blob', userId },
      userId,
      now: new Date(),
    });
    const blobId = JSON.parse(stored.body).data.attachment.id as string;

    // Témoin : une pièce ordinaire écrite comme UploadProcessor.uploadFile l'écrit (`messageId: null`).
    const ordinary = await prisma.messageAttachment.create({
      data: { messageId: null, fileName: 'a.jpg', originalName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 10, filePath: 'x/a.jpg', fileUrl: 'x/a.jpg', uploadedBy: userId, isAnonymous: false },
    });

    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    await prisma.messageAttachment.updateMany({ where: { id: { in: [blobId, ordinary.id] } }, data: { createdAt: twoDaysAgo } });

    const deleted: string[] = [];
    const attachmentService = { deleteAttachment: async (id: string) => { deleted.push(id); } };
    const maintenance = new MaintenanceService(prisma, attachmentService as never);
    await (maintenance as unknown as { cleanupOrphanedAttachments(): Promise<void> }).cleanupOrphanedAttachments();

    await prisma.messageAttachment.deleteMany({ where: { id: { in: [blobId, ordinary.id] } } });
    expect(deleted).toContain(ordinary.id);
    expect(deleted).toContain(blobId);
  }, 30000);
});
