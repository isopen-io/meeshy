#!/usr/bin/env tsx
/**
 * Script de migration forcée pour initialiser les champs de sécurité
 */
import '../src/env';
import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

async function forceMigration() {
  console.log('🚀 Migration forcée des champs utilisateurs...\n');

  try {
    // Récupérer TOUS les utilisateurs
    const users = await prisma.user.findMany({
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

    console.log(`📊 Total utilisateurs: ${users.length}\n`);

    let updatedCount = 0;

    for (const user of users) {
      // Calculer le taux de complétion du profil
      const fields = [
        user.displayName,
        user.avatar,
        user.bio && user.bio.length > 10,
        user.phoneNumber,
        user.email
      ];
      const completionRate = Math.round((fields.filter(Boolean).length / fields.length) * 100);

      // Mise à jour avec valeurs par défaut
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: user.emailVerified ?? false,
          phoneVerified: user.phoneVerified ?? false,
          twoFactorEnabled: user.twoFactorEnabled ?? false,
          failedLoginAttempts: user.failedLoginAttempts ?? 0,
          lastPasswordChange: user.lastPasswordChange ?? user.createdAt,
          profileCompletionRate: completionRate
        }
      });

      updatedCount++;
      console.log(`✓ ${user.username} (${updatedCount}/${users.length}) - Complétion: ${completionRate}%`);
    }

    console.log(`\n✅ Migration terminée: ${updatedCount} utilisateurs mis à jour!\n`);

  } catch (error) {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

forceMigration();
