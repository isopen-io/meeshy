require('dotenv').config();
const { PrismaClient } = require('@meeshy/shared/prisma/client');
const prisma = new PrismaClient();

async function checkOrphanAttachments() {
  try {
    // Chercher les attachments créés récemment
    const recentAttachments = await prisma.messageAttachment.findMany({
      where: {
        createdAt: {
          gte: new Date('2026-01-20T16:00:00Z')
        }
      },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        createdAt: true,
        transcription: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log('=== Attachments récents (après 16h) ===');
    for (const att of recentAttachments) {
      console.log(`\nAttachment: ${att.id}`);
      console.log(`  MessageId: ${att.messageId || 'NULL'}`);
      console.log(`  FileName: ${att.fileName}`);
      console.log(`  CreatedAt: ${att.createdAt}`);
      console.log(`  Has transcription: ${!!att.transcription}`);

      if (att.transcription) {
        const text = att.transcription.text || '';
        console.log(`  Transcription text: ${text.substring(0, 50)}...`);
        console.log(`  Segments count: ${att.transcription.segments?.length || 0}`);
        if (att.transcription.segments && att.transcription.segments.length > 0) {
          const firstSeg = att.transcription.segments[0];
          console.log(`  First segment:`, JSON.stringify(firstSeg));
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrphanAttachments();
