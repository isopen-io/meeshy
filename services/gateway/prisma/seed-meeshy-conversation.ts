import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Creating global Meeshy conversation...');

  // Find meeshy user (BIGBOSS - creator of Meeshy Global)
  const meeshyUser = await prisma.user.findUnique({
    where: { username: 'meeshy' }
  });

  if (!meeshyUser) {
    console.error('[SEED] Meeshy user not found! Cannot create conversation.');
    throw new Error('Meeshy user must be created before running this seed');
  }

  console.log('[SEED] Found meeshy user:', meeshyUser.id);

  // Find admin user (will be ADMIN, not CREATOR)
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

    // Check if meeshy is already a member
    const meeshyMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId: existing.id,
        userId: meeshyUser.id
      }
    });

    if (meeshyMember) {
      // Update role to CREATOR if not already
      if (meeshyMember.role !== 'CREATOR') {
        await prisma.conversationMember.update({
          where: { id: meeshyMember.id },
          data: { role: 'CREATOR' }
        });
        console.log('[SEED] Updated meeshy role to CREATOR');
      } else {
        console.log('[SEED] Meeshy is already CREATOR');
      }
    } else {
      // Add meeshy as CREATOR
      await prisma.conversationMember.create({
        data: {
          conversationId: existing.id,
          userId: meeshyUser.id,
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
      console.log('[SEED] Added meeshy as CREATOR');
    }

    // Check if admin is already a member
    const adminMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId: existing.id,
        userId: adminUser.id
      }
    });

    if (adminMember) {
      // Update role to ADMIN if not already
      if (adminMember.role !== 'ADMIN') {
        await prisma.conversationMember.update({
          where: { id: adminMember.id },
          data: { role: 'ADMIN' }
        });
        console.log('[SEED] Updated admin role to ADMIN');
      } else {
        console.log('[SEED] Admin is already ADMIN');
      }
    } else {
      // Add admin as ADMIN
      await prisma.conversationMember.create({
        data: {
          conversationId: existing.id,
          userId: adminUser.id,
          role: 'ADMIN',
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
      console.log('[SEED] Added admin as ADMIN');
    }

    // Update createdBy to meeshy
    await prisma.conversation.update({
      where: { id: existing.id },
      data: { createdBy: meeshyUser.id }
    });
    console.log('[SEED] Updated conversation createdBy to meeshy');

    return;
  }

  // Create the global Meeshy conversation with meeshy as creator
  const meeshyConversation = await prisma.conversation.create({
    data: {
      identifier: 'meeshy',
      title: 'Meeshy Global',
      type: 'global',
      isPublic: true,
      createdBy: meeshyUser.id,
      conversationMembers: {
        create: [
          {
            userId: meeshyUser.id,
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
          },
          {
            userId: adminUser.id,
            role: 'ADMIN',
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
        ]
      }
    }
  });

  console.log('[SEED] Created global Meeshy conversation with ID:', meeshyConversation.id);
  console.log('[SEED] Meeshy added as CREATOR');
  console.log('[SEED] Admin added as ADMIN');
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
