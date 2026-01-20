/**
 * Backup des utilisateurs en JSON avant migration des rôles
 * Alternative à mongodump pour sauvegarder uniquement les données critiques
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function backupUsers() {
  console.log('🔄 Backup des utilisateurs en cours...\n');

  try {
    // Récupérer tous les utilisateurs avec leurs données critiques
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        displayName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`📊 ${users.length} utilisateurs trouvés\n`);

    // Statistiques par rôle
    const roleStats: Record<string, number> = {};
    users.forEach(user => {
      roleStats[user.role] = (roleStats[user.role] || 0) + 1;
    });

    console.log('📊 Répartition par rôle :');
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} utilisateurs`);
    });
    console.log('');

    // Créer le répertoire de backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = join(process.cwd(), 'backups', `users-before-role-migration-${timestamp}`);
    mkdirSync(backupDir, { recursive: true });

    // Sauvegarder en JSON
    const backupPath = join(backupDir, 'users-backup.json');
    writeFileSync(
      backupPath,
      JSON.stringify(
        {
          backupDate: new Date().toISOString(),
          totalUsers: users.length,
          roleStats,
          users
        },
        null,
        2
      )
    );

    console.log(`✅ Backup sauvegardé : ${backupPath}\n`);

    // Créer un fichier de métadonnées
    const metadataPath = join(backupDir, 'backup-info.txt');
    writeFileSync(
      metadataPath,
      `BACKUP UTILISATEURS - MIGRATION RÔLES
========================================

Date du backup : ${new Date().toISOString()}
Nombre d'utilisateurs : ${users.length}

Répartition par rôle :
${Object.entries(roleStats).map(([role, count]) => `  ${role}: ${count}`).join('\n')}

Fichiers :
  - users-backup.json : Données complètes des utilisateurs
  - backup-info.txt : Ce fichier

Raison : Migration MODO → MODERATOR

Restauration manuelle :
  Si nécessaire, utilisez ce backup pour vérifier les données
  avant/après migration et restaurer manuellement si besoin.
`
    );

    console.log(`📝 Métadonnées sauvegardées : ${metadataPath}\n`);
    console.log('✅ Backup terminé avec succès !\n');

    return backupDir;

  } catch (error) {
    console.error('❌ Erreur lors du backup :', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution
backupUsers()
  .then(backupDir => {
    console.log(`📁 Répertoire de backup : ${backupDir}`);
    console.log('➡️  Vous pouvez maintenant procéder à la migration\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Backup échoué :', error);
    process.exit(1);
  });
