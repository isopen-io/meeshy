/**
 * Migration : Aligner les rôles utilisateur sur des valeurs explicites
 *
 * Transformations :
 * - "MODO" → "MODERATOR"
 * - Valide que tous les rôles sont conformes
 */

import { PrismaClient } from '../client';

const prisma = new PrismaClient();

async function migrateUserRoles() {
  console.log('🔄 Début de la migration des rôles utilisateur...\n');

  try {
    // 1. Compter les utilisateurs par rôle actuel
    const roleStats = await prisma.user.groupBy({
      by: ['role'],
      _count: true
    });

    console.log('📊 Statistiques actuelles :');
    roleStats.forEach(stat => {
      console.log(`   ${stat.role}: ${stat._count} utilisateurs`);
    });
    console.log('');

    // 2. Migrer "MODO" → "MODERATOR"
    const modoCount = await prisma.user.count({
      where: { role: 'MODO' }
    });

    if (modoCount > 0) {
      console.log(`🔧 Migration de ${modoCount} utilisateurs MODO → MODERATOR...`);

      const result = await prisma.user.updateMany({
        where: { role: 'MODO' },
        data: { role: 'MODERATOR' }
      });

      console.log(`   ✅ ${result.count} utilisateurs migrés\n`);
    } else {
      console.log('✅ Aucun utilisateur avec rôle "MODO" trouvé\n');
    }

    // 3. Vérifier les rôles non-standard
    const validRoles = ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'];

    const invalidRoles = await prisma.user.findMany({
      where: {
        role: {
          notIn: validRoles
        }
      },
      select: {
        id: true,
        username: true,
        role: true
      }
    });

    if (invalidRoles.length > 0) {
      console.log('⚠️  Utilisateurs avec rôles non-standard :');
      invalidRoles.forEach(user => {
        console.log(`   - ${user.username} (${user.id}): "${user.role}"`);
      });
      console.log('');
      console.log('❌ Veuillez corriger ces rôles manuellement avant de continuer.\n');
      process.exit(1);
    } else {
      console.log('✅ Tous les rôles sont conformes\n');
    }

    // 4. Statistiques finales
    const finalStats = await prisma.user.groupBy({
      by: ['role'],
      _count: true
    });

    console.log('📊 Statistiques après migration :');
    finalStats.forEach(stat => {
      console.log(`   ${stat.role}: ${stat._count} utilisateurs`);
    });
    console.log('');

    console.log('✅ Migration terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la migration :', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution
migrateUserRoles()
  .catch((error) => {
    console.error('Migration échouée :', error);
    process.exit(1);
  });
