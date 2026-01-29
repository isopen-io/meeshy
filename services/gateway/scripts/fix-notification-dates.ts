/**
 * Script de migration pour corriger les dates de notification invalides
 *
 * Usage:
 *   cd services/gateway
 *   npx ts-node scripts/fix-notification-dates.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Charger les variables d'environnement
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

async function fixNotificationDates() {
  console.log('🔍 Recherche des notifications avec dates invalides...\n');

  // Trouver toutes les notifications
  const allNotifications = await prisma.notification.findMany({
    select: {
      id: true,
      createdAt: true,
      isRead: true,
      readAt: true,
    },
  });

  console.log(`📊 Total de notifications: ${allNotifications.length}\n`);

  // Identifier celles avec createdAt invalide (null, undefined, ou date invalide)
  const invalidNotifications = allNotifications.filter((n) => {
    if (!n.createdAt) return true;
    if (!(n.createdAt instanceof Date)) return true;
    if (isNaN(n.createdAt.getTime())) return true;
    return false;
  });

  console.log(`❌ Notifications avec createdAt invalide: ${invalidNotifications.length}\n`);

  if (invalidNotifications.length === 0) {
    console.log('✅ Toutes les notifications ont des dates valides !');
    return;
  }

  // Pour chaque notification invalide, utiliser readAt si disponible, sinon now() moins un certain temps
  let fixedCount = 0;
  const fallbackDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours dans le passé

  for (const notification of invalidNotifications) {
    try {
      // Utiliser readAt si disponible, sinon fallback
      const fixedDate = notification.readAt || fallbackDate;

      await prisma.notification.update({
        where: { id: notification.id },
        data: { createdAt: fixedDate },
      });

      fixedCount++;

      if (fixedCount % 100 === 0) {
        console.log(`⏳ Progression: ${fixedCount}/${invalidNotifications.length} corrigées...`);
      }
    } catch (error) {
      console.error(`❌ Erreur pour notification ${notification.id}:`, error);
    }
  }

  console.log(`\n✅ Migration terminée !`);
  console.log(`   - Total corrigé: ${fixedCount}/${invalidNotifications.length}`);
  console.log(`   - Date fallback utilisée: ${fallbackDate.toISOString()}`);
}

// Exécuter la migration
fixNotificationDates()
  .catch((error) => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
