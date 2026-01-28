import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Creating global Meeshy conversation...');

  // Find admin user
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!adminUser) {
    console.error('[SEED] Admin user not found! Cannot create conversation.');
    throw new Error('Admin user must be created before running this seed');
  }

  console.log('[SEED] Found admin user:', adminUser.id);

  // Check if conversation already exists
  const existing = await prisma.conversation.findFirst({
    where: { identifier: 'meeshy' }
  });

  if (existing) {
    console.log('[SEED] Conversation "meeshy" already exists with ID:', existing.id);

    // Check if admin is already a member
    const adminMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId: existing.id,
        userId: adminUser.id
      }
    });

    if (adminMember) {
      // Update role to CREATOR if not already
      if (adminMember.role !== 'CREATOR') {
        await prisma.conversationMember.update({
          where: { id: adminMember.id },
          data: { role: 'CREATOR' }
        });
        console.log('[SEED] Updated admin role to CREATOR');
      } else {
        console.log('[SEED] Admin is already CREATOR');
      }
    } else {
      // Add admin as CREATOR
      await prisma.conversationMember.create({
        data: {
          conversationId: existing.id,
          userId: adminUser.id,
          role: 'CREATOR',
          canSendMessage: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: true,
          canSendAudios: true,
          canSendLocations: true,
          canSendLinks: true,
          joinedAt: new Date(),
          isActive: true
        }
      });
      console.log('[SEED] Added admin as CREATOR');
    }

    // Update createdBy to admin
    await prisma.conversation.update({
      where: { id: existing.id },
      data: { createdBy: adminUser.id }
    });
    console.log('[SEED] Updated conversation createdBy to admin');

    return;
  }

  // Create the global Meeshy conversation with admin as creator
  const meeshyConversation = await prisma.conversation.create({
    data: {
      identifier: 'meeshy',
      title: 'Meeshy Global',
      type: 'global',
      isPublic: true,
      createdBy: adminUser.id,
      conversationMembers: {
        create: {
          userId: adminUser.id,
          role: 'CREATOR',
          canSendMessage: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: true,
          canSendAudios: true,
          canSendLocations: true,
          canSendLinks: true,
          joinedAt: new Date(),
          isActive: true
        }
      }
    }
  });

  console.log('[SEED] Created global Meeshy conversation with ID:', meeshyConversation.id);
  console.log('[SEED] Admin added as CREATOR');
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
