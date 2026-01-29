/**
 * Script pour vérifier les dates des notifications dans la DB
 *
 * Usage:
 *   cd services/gateway
 *   npx ts-node scripts/check-notification-dates.ts
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

async function checkNotificationDates() {
  console.log('🔍 Vérification des dates dans la DB...\n');

  // Récupérer les 5 premières notifications
  const notifications = await prisma.notification.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      isRead: true,
      readAt: true,
      userId: true,
    },
  });

  console.log(`📊 Nombre de notifications: ${notifications.length}\n`);

  notifications.forEach((n, index) => {
    console.log(`\n${index + 1}. Notification ${n.id}`);
    console.log(`   Type: ${n.type}`);
    console.log(`   Content: ${n.content.substring(0, 50)}...`);
    console.log(`   createdAt: ${n.createdAt}`);
    console.log(`   createdAt type: ${typeof n.createdAt}`);
    console.log(`   createdAt instanceof Date: ${n.createdAt instanceof Date}`);
    console.log(`   createdAt.toISOString(): ${n.createdAt instanceof Date ? n.createdAt.toISOString() : 'N/A'}`);
    console.log(`   isRead: ${n.isRead}`);
    console.log(`   readAt: ${n.readAt}`);
  });

  // Vérifier s'il y a des notifications avec createdAt null
  const nullCreatedAtCount = await prisma.notification.count({
    where: {
      createdAt: null as any,
    },
  });

  console.log(`\n\n❓ Notifications avec createdAt null: ${nullCreatedAtCount}`);

  // Statistiques sur les dates
  const allNotifications = await prisma.notification.findMany({
    select: { createdAt: true },
  });

  const uniqueDates = new Set(
    allNotifications.map(n => n.createdAt?.toISOString() || 'null')
  );

  console.log(`\n📊 Statistiques:`);
  console.log(`   Total notifications: ${allNotifications.length}`);
  console.log(`   Dates uniques: ${uniqueDates.size}`);

  if (uniqueDates.size === 1) {
    console.log(`   ⚠️  ATTENTION : Toutes les notifications ont la même date !`);
    console.log(`   Date commune: ${Array.from(uniqueDates)[0]}`);
  }
}

checkNotificationDates()
  .catch((error) => {
    console.error('💥 Erreur:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
