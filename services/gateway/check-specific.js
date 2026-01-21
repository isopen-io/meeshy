require('dotenv').config();
const { PrismaClient } = require('@meeshy/shared/prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const targetMessageId = '696faaf201bb5bef33c7eced';
    const targetAttachmentId = '696faaf001bb5bef33c7ecec';

    console.log(`\n=== Checking attachment ${targetAttachmentId} ===`);

    const attachment = await prisma.messageAttachment.findUnique({
      where: { id: targetAttachmentId },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        createdAt: true,
        transcription: true,
        translations: true
      }
    });

    if (!attachment) {
      console.log('Attachment NOT FOUND');
      return;
    }

    console.log(`MessageId: ${attachment.messageId || 'NULL'}`);
    console.log(`FileName: ${attachment.fileName}`);
    console.log(`Has transcription: ${!!attachment.transcription}`);
    console.log(`Has translations: ${!!attachment.translations}`);

    if (attachment.transcription) {
      console.log(`\nTranscription:`);
      console.log(`  Text: ${(attachment.transcription.text || '').substring(0, 50)}...`);
      console.log(`  Segments: ${attachment.transcription.segments?.length || 0}`);

      if (attachment.transcription.segments && attachment.transcription.segments.length > 0) {
        console.log(`  First segment:`, JSON.stringify(attachment.transcription.segments[0]));
      }
    }

    if (attachment.translations) {
      const langs = Object.keys(attachment.translations);
      console.log(`\nTranslations: ${langs.join(', ')}`);

      if (langs.length > 0) {
        const firstLang = langs[0];
        const translation = attachment.translations[firstLang];
        console.log(`  ${firstLang} segments:`, translation.segments?.length || 0);
        if (translation.segments && translation.segments.length > 0) {
          console.log(`  First segment:`, JSON.stringify(translation.segments[0]));
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
