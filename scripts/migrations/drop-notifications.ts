/**
 * Script de suppression de la collection notifications
 *
 * Utilisé pour la migration V2 du système de notifications
 * Supprime complètement les anciennes notifications au lieu de les migrer
 *
 * Usage:
 *   pnpm tsx scripts/migrations/drop-notifications.ts
 *   pnpm tsx scripts/migrations/drop-notifications.ts --confirm
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

async function dropNotifications() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');

  if (!confirmed) {
    console.log('⚠️  ATTENTION: Cette opération va SUPPRIMER TOUTES les notifications existantes');
    console.log('');
    console.log('Ce script fait partie de la migration vers la structure V2 des notifications.');
    console.log('Toutes les notifications existantes seront perdues définitivement.');
    console.log('');
    console.log('Pour confirmer, exécutez:');
    console.log('  pnpm tsx scripts/migrations/drop-notifications.ts --confirm');
    console.log('');
    return;
  }

  try {
    console.log('🗑️  Suppression de la collection notifications...');

    // Compter les notifications avant suppression
    const count = await prisma.notification.count();
    console.log(`📊 Nombre de notifications à supprimer: ${count}`);

    if (count === 0) {
      console.log('✅ Aucune notification à supprimer');
      return;
    }

    // Supprimer toutes les notifications
    const result = await prisma.notification.deleteMany({});
    console.log(`✅ ${result.count} notifications supprimées avec succès`);

    console.log('');
    console.log('✨ Migration V2 prête:');
    console.log('  - La collection est maintenant vide');
    console.log('  - Redémarrez le serveur pour que Prisma crée les nouveaux indexes');
    console.log('  - Les nouvelles notifications utiliseront automatiquement la structure V2');

  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

dropNotifications()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
