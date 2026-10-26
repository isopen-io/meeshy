/**
 * #13104 — l'index « Médias, liens et documents » ne range jamais un blob
 * chiffré de bout en bout (`application/octet-stream`, sans nom) sous un genre :
 * il le présenterait comme un document téléchargeable. Sur un VRAI mongod
 * (`AUDIT_MONGO_URL`, replica set) : le stub Prisma de `jest.config.json` ne
 * distingue pas un champ absent d'un champ nul, et c'est la forme ABSENTE des
 * anciennes lignes que `differsOrUnset` doit garder.
 */
import path from 'path';
import { predicatDeMedia } from '../messages-media-kinds';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require(path.resolve(__dirname, '../../../../../../packages/shared/prisma/client/index.js'));

const MONGO = process.env.AUDIT_MONGO_URL ?? '';
const run = MONGO ? describe : describe.skip;

run('#13104 — un blob e2ee n’entre dans aucun genre de l’index', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: MONGO } } });
  afterAll(() => prisma.$disconnect());

  it('un document en clair (ancien ou neuf) reste, le blob e2ee sort', async () => {
    const conversationId = '6ade000000000000000c0001';
    const senderId = '6ade000000000000000c0002';
    const make = async (encryptionMode: string | undefined) => {
      const message = await prisma.message.create({
        data: { conversationId, senderId, content: encryptionMode === 'e2ee' ? '[Encrypted]' : 'doc', messageType: 'file' },
      });
      await prisma.messageAttachment.create({
        data: {
          messageId: message.id, fileName: 'f', originalName: encryptionMode === 'e2ee' ? '' : 'rapport.pdf',
          mimeType: encryptionMode === 'e2ee' ? 'application/octet-stream' : 'application/pdf', fileSize: 10,
          filePath: 'x', fileUrl: 'x', uploadedBy: senderId, isAnonymous: false,
          ...(encryptionMode ? { encryptionMode, isEncrypted: encryptionMode === 'e2ee' } : {}),
        },
      });
      return message.id as string;
    };
    const legacy = await make(undefined);
    const atRest = await make('server');
    const sealed = await make('e2ee');

    const found = await prisma.message.findMany({
      where: { conversationId, ...predicatDeMedia(['document', 'visual', 'audio', 'contact'], undefined) },
      select: { id: true },
    });
    await prisma.messageAttachment.deleteMany({ where: { messageId: { in: [legacy, atRest, sealed] } } });
    await prisma.message.deleteMany({ where: { id: { in: [legacy, atRest, sealed] } } });

    const ids = found.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([legacy, atRest]));
    expect(ids).not.toContain(sealed);
  }, 30000);
});
