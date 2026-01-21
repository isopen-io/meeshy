const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function findConversation() {
  console.log('🔍 Recherche de la conversation avec attachment 696e9198066d60252d4ef4eb...');

  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: '696e9198066d60252d4ef4eb' },
    include: {
      message: {
        select: {
          id: true,
          conversationId: true
        }
      }
    }
  });

  if (!attachment) {
    console.log('❌ Attachment non trouvé');
    return;
  }

  console.log('✅ Attachment trouvé');
  console.log(`   Message ID: ${attachment.message.id}`);
  console.log(`   Conversation ID: ${attachment.message.conversationId}`);

  return {
    messageId: attachment.message.id,
    conversationId: attachment.message.conversationId
  };
}

findConversation()
  .then((result) => {
    if (result) {
      console.log('\n📊 Résultat:');
      console.log(JSON.stringify(result, null, 2));
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
