// Sonde sur un VRAI mongod (#10789, audit du 2026-10-25) : la suppression d'un message cascade sur ses pièces ;
// un blob réservé puis non rendu est supprimé. Usage : node <ce fichier> <chemin du client Prisma généré> (mongod rs0 sur 127.0.0.1:27998).
const { PrismaClient } = require(process.argv[2]);
(async () => {
  const p = new PrismaClient({ datasources: { db: { url: 'mongodb://127.0.0.1:27998/probe?replicaSet=rs0&directConnection=true' } } });
  const base = { fileName: 'e2ee_x.bin', originalName: '', mimeType: 'application/octet-stream', fileSize: 592, filePath: 'p', fileUrl: 'u', uploadedBy: '507f1f77bcf86cd799439011', encryptionMode: 'e2ee', isEncrypted: true };
  const run = async (release) => {
    const m = await p.message.create({ data: { conversationId: '507f1f77bcf86cd799439012', senderId: '507f1f77bcf86cd799439014', content: '[Encrypted]', originalLanguage: 'fr' } });
    const a = await p.messageAttachment.create({ data: { ...base } });
    await p.messageAttachment.updateMany({ where: { id: { in: [a.id] }, OR: [{ messageId: { isSet: false } }, { messageId: null }] }, data: { messageId: m.id, rank: 0 } });
    if (release) await p.messageAttachment.updateMany({ where: { messageId: m.id }, data: { messageId: null, rank: null, isViewOnce: false, isBlurred: false, effectFlags: 0 } });
    await p.message.delete({ where: { id: m.id } });
    const after = await p.messageAttachment.findUnique({ where: { id: a.id }, select: { id: true, messageId: true } });
    const rebind = after ? await p.messageAttachment.updateMany({ where: { id: { in: [a.id] }, OR: [{ messageId: { isSet: false } }, { messageId: null }] }, data: { messageId: '507f1f77bcf86cd7994390ff' } }) : null;
    console.log(release ? 'avec libération' : 'sans libération', '-> blob', after ? 'survit' : 'SUPPRIMÉ', after ? `, rattachable: ${rebind.count === 1}` : '');
  };
  await run(false); await run(true);
  await p.$disconnect();
})().catch(e => { console.error(e.message.slice(0, 400)); process.exit(1); });
