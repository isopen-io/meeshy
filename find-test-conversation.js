const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function findTestConversation() {
  console.log('🔍 Recherche d\'une conversation avec des segments de transcription...');

  // Trouver un attachment avec transcription
  const attachments = await prisma.messageAttachment.findMany({
    where: {
      transcription: {
        not: null
      }
    },
    take: 1,
    include: {
      message: {
        select: {
          id: true,
          conversationId: true
        }
      }
    }
  });

  if (attachments.length === 0) {
    console.log('❌ Aucun attachment avec transcription trouvé');
    return null;
  }

  const attachment = attachments[0];
  const segmentCount = attachment.transcription?.segments?.length || 0;

  console.log('✅ Attachment trouvé:');
  console.log(`   Attachment ID: ${attachment.id}`);
  console.log(`   Message ID: ${attachment.message.id}`);
  console.log(`   Conversation ID: ${attachment.message.conversationId}`);
  console.log(`   Nombre de segments: ${segmentCount}`);

  // Afficher un segment exemple
  if (segmentCount > 0) {
    const seg = attachment.transcription.segments[0];
    console.log('\n📝 Premier segment:');
    console.log(`   text: "${seg.text}"`);
    console.log(`   startMs: ${seg.startMs}`);
    console.log(`   endMs: ${seg.endMs}`);
    console.log(`   speakerId: ${seg.speakerId}`);
    console.log(`   voiceSimilarityScore: ${seg.voiceSimilarityScore} (type: ${typeof seg.voiceSimilarityScore})`);
    console.log(`   confidence: ${seg.confidence}`);
    console.log(`   language: ${seg.language}`);
  }

  return {
    attachmentId: attachment.id,
    messageId: attachment.message.id,
    conversationId: attachment.message.conversationId,
    segmentCount
  };
}

findTestConversation()
  .then((result) => {
    if (result) {
      console.log('\n🎯 URL de test:');
      console.log(`   GET https://192.168.1.39:3000/api/v1/conversations/${result.conversationId}/messages`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
