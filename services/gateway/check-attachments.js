require('dotenv').config();
const { PrismaClient } = require('@meeshy/shared/prisma/client');
const prisma = new PrismaClient();

async function checkAttachments() {
  try {
    const messageIds = [
      '696faaf201bb5bef33c7eced',
      '696f8648ea05c05bb6e5da37'
    ];
    
    for (const msgId of messageIds) {
      console.log(`\n=== Message ${msgId} ===`);
      
      const message = await prisma.message.findUnique({
        where: { id: msgId },
        select: {
          id: true,
          originalLanguage: true,
          attachments: true
        }
      });
      
      console.log('Attachments count:', message?.attachments?.length || 0);
      if (message?.attachments?.length > 0) {
        console.log('First attachment ID:', message.attachments[0].id);
        console.log('Has transcription:', !!message.attachments[0].transcription);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAttachments();
