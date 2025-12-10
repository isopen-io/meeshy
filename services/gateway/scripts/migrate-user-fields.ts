#!/usr/bin/env tsx
/**
 * Script de migration pour mettre à jour les utilisateurs existants
 * avec les nouveaux champs de sécurité et de vérification
 *
 * Usage: pnpm tsx scripts/migrate-user-fields.ts
 */

import '../src/env';
import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

async function migrateUserFields() {
  console.log('🚀 Démarrage de la migration des champs utilisateurs...\n');

  try {
    // 1. Compter les utilisateurs à migrer
    const usersToMigrate = await prisma.user.count({
      where: {
        OR: [
          { emailVerified: null },
          { phoneVerified: null },
          { twoFactorEnabled: null },
          { failedLoginAttempts: null },
          { lastPasswordChange: null },
          { profileCompletionRate: null }
        ]
      }
    });

    console.log(`📊 Utilisateurs à migrer: ${usersToMigrate}`);

    if (usersToMigrate === 0) {
      console.log('✅ Aucun utilisateur à migrer. Base de données déjà à jour.\n');
      return;
    }

    // 2. Récupérer tous les utilisateurs qui ont besoin de migration
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { emailVerified: null },
          { phoneVerified: null },
          { twoFactorEnabled: null },
          { failedLoginAttempts: null },
          { lastPasswordChange: null },
          { profileCompletionRate: null }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        phoneVerified: true,
        twoFactorEnabled: true,
        failedLoginAttempts: true,
        lastPasswordChange: true,
        profileCompletionRate: true,
        createdAt: true,
        avatar: true,
        bio: true,
        displayName: true,
        phoneNumber: true
      }
    });

    console.log(`\n🔄 Migration de ${users.length} utilisateurs...\n`);

    let successCount = 0;
    let errorCount = 0;

    // 3. Migrer chaque utilisateur
    for (const user of users) {
      try {
        // Calculer le taux de complétion du profil
        let completionRate = 0;
        const fields = [
          user.displayName,
          user.avatar,
          user.bio && user.bio.length > 10,
          user.phoneNumber,
          user.email
        ];
        completionRate = Math.round((fields.filter(Boolean).length / fields.length) * 100);

        // Mettre à jour l'utilisateur
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: user.emailVerified ?? false,
            phoneVerified: user.phoneVerified ?? false,
            twoFactorEnabled: user.twoFactorEnabled ?? false,
            failedLoginAttempts: user.failedLoginAttempts ?? 0,
            lastPasswordChange: user.lastPasswordChange ?? user.createdAt,
            profileCompletionRate: user.profileCompletionRate ?? completionRate
          }
        });

        successCount++;
        process.stdout.write(`✓ ${user.username} (${successCount}/${users.length})\r`);
      } catch (error) {
        errorCount++;
        console.error(`\n❌ Erreur pour ${user.username}:`, error);
      }
    }

    console.log(`\n\n✅ Migration terminée avec succès !`);
    console.log(`   - Utilisateurs migrés: ${successCount}`);
    console.log(`   - Erreurs: ${errorCount}`);

    // 4. Vérification finale
    const remainingToMigrate = await prisma.user.count({
      where: {
        OR: [
          { emailVerified: null },
          { phoneVerified: null },
          { twoFactorEnabled: null },
          { failedLoginAttempts: null },
          { lastPasswordChange: null },
          { profileCompletionRate: null }
        ]
      }
    });

    if (remainingToMigrate === 0) {
      console.log('\n🎉 Tous les utilisateurs ont été migrés avec succès !\n');
    } else {
      console.warn(`\n⚠️  Il reste ${remainingToMigrate} utilisateurs à migrer.\n`);
    }

  } catch (error) {
    console.error('\n❌ Erreur critique lors de la migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter la migration
migrateUserFields()
  .then(() => {
    console.log('✅ Script de migration terminé.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Échec du script de migration:', error);
    process.exit(1);
  });
