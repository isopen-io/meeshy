require('dotenv').config();
const { PrismaClient } = require('@meeshy/shared/prisma/client');
const prisma = new PrismaClient();

async function main() {
  const conversationId = '696f7d4d9c34b8c4d8f8a2ab';

  console.log('Checking attachments for conversation\n');

  const messages = await prisma.message.findMany({
    where: { conversationId },
    select: {
      id: true,
      createdAt: true,
      originalLanguage: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          transcription: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log(`Found ${messages.length} recent messages\n`);

  for (const msg of messages) {
    const dateStr = msg.createdAt.toISOString();
    console.log(`Message: ${msg.id} (${dateStr})`);
    console.log(`  Attachments: ${msg.attachments.length}`);

    for (const att of msg.attachments) {
      const shortName = att.fileName.substring(0, 30);
      console.log(`  - ${att.id}: ${shortName}...`);
      if (att.transcription) {
        const segCount = att.transcription.segments ? att.transcription.segments.length : 0;
        console.log(`    Segments: ${segCount}`);
      }
    }
    console.log('');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
