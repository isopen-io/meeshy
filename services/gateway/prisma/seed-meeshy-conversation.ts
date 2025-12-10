import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Creating global Meeshy conversation...');

  // Check if conversation already exists
  const existing = await prisma.conversation.findFirst({
    where: { identifier: 'meeshy' }
  });

  if (existing) {
    console.log('[SEED] Conversation "meeshy" already exists with ID:', existing.id);
    return;
  }

  // Create the global Meeshy conversation
  const meeshyConversation = await prisma.conversation.create({
    data: {
      identifier: 'meeshy',
      title: 'Meeshy Global',
      type: 'global',
      isPublic: true,
      createdBy: '000000000000000000000000', // System user placeholder
      // Pas de membres pour l'instant - ils seront ajoutés quand ils rejoindront
    }
  });

  console.log('[SEED] Created global Meeshy conversation with ID:', meeshyConversation.id);
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
