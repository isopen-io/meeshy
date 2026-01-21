/**
 * Script pour nettoyer les membres en double
 * Garde le rôle le plus important (CREATOR > ADMIN > MODERATOR > MEMBER)
 */

require('dotenv').config({ path: './services/gateway/.env' });
const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

// Hiérarchie des rôles
const ROLE_HIERARCHY = {
  'CREATOR': 5,
  'ADMIN': 4,
  'MODERATOR': 3,
  'MEMBER': 1
};

async function fixDuplicates() {
  try {
    console.log('🔧 Nettoyage des doublons...\n');

    // Récupérer tous les membres actifs
    const members = await prisma.conversationMember.findMany({
      where: { isActive: true },
      select: {
        id: true,
        conversationId: true,
        userId: true,
        role: true,
        joinedAt: true
      },
      orderBy: { joinedAt: 'asc' }
    });

    // Grouper par conversationId + userId
    const memberMap = new Map();
    const toDelete = [];

    for (const member of members) {
      const key = `${member.conversationId}_${member.userId}`;

      if (memberMap.has(key)) {
        const existing = memberMap.get(key);

        // Comparer les rôles
        const existingWeight = ROLE_HIERARCHY[existing.role] || 0;
        const currentWeight = ROLE_HIERARCHY[member.role] || 0;

        if (currentWeight > existingWeight) {
          // Le nouveau rôle est plus important, supprimer l'ancien
          console.log(`⚠️  Doublon trouvé: userId ${member.userId} dans conversation ${member.conversationId}`);
          console.log(`   Garde: ${member.role} (poids ${currentWeight})`);
          console.log(`   Supprime: ${existing.role} (poids ${existingWeight})`);
          toDelete.push(existing.id);
          memberMap.set(key, member);
        } else {
          // L'ancien rôle est plus important ou égal, supprimer le nouveau
          console.log(`⚠️  Doublon trouvé: userId ${member.userId} dans conversation ${member.conversationId}`);
          console.log(`   Garde: ${existing.role} (poids ${existingWeight})`);
          console.log(`   Supprime: ${member.role} (poids ${currentWeight})`);
          toDelete.push(member.id);
        }
      } else {
        memberMap.set(key, member);
      }
    }

    if (toDelete.length === 0) {
      console.log('\n✅ Aucun doublon à nettoyer !');
      return;
    }

    console.log(`\n🗑️  Suppression de ${toDelete.length} entrée(s) en double...\n`);

    // Désactiver les doublons
    const result = await prisma.conversationMember.updateMany({
      where: {
        id: { in: toDelete }
      },
      data: {
        isActive: false,
        leftAt: new Date()
      }
    });

    console.log(`✅ ${result.count} doublon(s) nettoyé(s) avec succès !\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicates();
