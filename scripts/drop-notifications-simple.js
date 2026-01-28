/**
 * Script simple pour supprimer toutes les notifications
 * Usage: node scripts/drop-notifications-simple.js --confirm
 */

const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function dropNotifications() {
  const confirmed = process.argv.includes('--confirm');

  if (!confirmed) {
    console.log('⚠️  ATTENTION: Cette opération va SUPPRIMER TOUTES les notifications');
    console.log('');
    console.log('Pour confirmer, exécutez:');
    console.log('  node scripts/drop-notifications-simple.js --confirm');
    console.log('');
    return;
  }

  try {
    console.log('🗑️  Suppression des notifications...');

    const count = await prisma.notification.count();
    console.log(`📊 Notifications à supprimer: ${count}`);

    if (count === 0) {
      console.log('✅ Aucune notification à supprimer');
      return;
    }

    const result = await prisma.notification.deleteMany({});
    console.log(`✅ ${result.count} notifications supprimées`);
    console.log('');
    console.log('✨ Prêt pour la nouvelle structure V2');

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

dropNotifications();
