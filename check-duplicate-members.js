/**
 * Script pour vérifier les membres en double dans les conversations
 */

require('dotenv').config({ path: './services/gateway/.env' });
const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function checkDuplicateMembers() {
  try {
    console.log('🔍 Recherche de membres en double...\n');

    // Récupérer tous les membres actifs
    const members = await prisma.conversationMember.findMany({
      where: { isActive: true },
      select: {
        id: true,
        conversationId: true,
        userId: true,
        role: true,
        joinedAt: true
      }
    });

    console.log(`📊 Total de membres actifs: ${members.length}\n`);

    // Grouper par conversationId + userId
    const memberMap = new Map();
    const duplicates = [];

    for (const member of members) {
      const key = `${member.conversationId}_${member.userId}`;

      if (memberMap.has(key)) {
        // Doublon trouvé !
        duplicates.push({
          key,
          conversationId: member.conversationId,
          userId: member.userId,
          existing: memberMap.get(key),
          duplicate: member
        });
      } else {
        memberMap.set(key, member);
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ Aucun doublon trouvé !');
    } else {
      console.log(`❌ ${duplicates.length} doublons trouvés:\n`);

      for (const dup of duplicates) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Conversation: ${dup.conversationId}`);
        console.log(`User ID: ${dup.userId}`);
        console.log(`\nEntrée 1 (ID: ${dup.existing.id}):`);
        console.log(`  - Rôle: ${dup.existing.role}`);
        console.log(`  - Rejoint: ${dup.existing.joinedAt}`);
        console.log(`\nEntrée 2 (ID: ${dup.duplicate.id}):`);
        console.log(`  - Rôle: ${dup.duplicate.role}`);
        console.log(`  - Rejoint: ${dup.duplicate.joinedAt}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicateMembers();
