/**
 * Script de diagnostic - Vérifier la structure des notifications en DB
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

async function checkNotificationStructure() {
  console.log('🔍 Vérification structure des notifications...\n');

  try {
    // Compter les notifications
    const total = await prisma.notification.count();
    console.log(`📊 Total notifications: ${total}\n`);

    if (total === 0) {
      console.log('✅ Aucune notification en DB - Prêt pour nouvelle structure\n');
      return;
    }

    // Prendre quelques exemples
    const samples = await prisma.notification.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
    });

    console.log('📝 Exemples de notifications (3 plus récentes):\n');

    for (const notif of samples) {
      console.log('---');
      console.log(`ID: ${notif.id}`);
      console.log(`Type: ${notif.type}`);
      console.log(`UserId: ${notif.userId}`);
      console.log(`isRead (racine): ${(notif as any).isRead}`);
      console.log(`readAt (racine): ${(notif as any).readAt}`);
      console.log(`createdAt (racine): ${(notif as any).createdAt}`);
      console.log(`expiresAt (racine): ${(notif as any).expiresAt}`);
      console.log(`actor (Json): ${JSON.stringify((notif as any).actor, null, 2)}`);
      console.log(`context (Json): ${JSON.stringify((notif as any).context, null, 2)}`);
      console.log(`metadata (Json): ${JSON.stringify((notif as any).metadata, null, 2)}`);
      console.log(`delivery (Json): ${JSON.stringify((notif as any).delivery, null, 2)}`);
      console.log('');
    }

    // Vérifier si certaines notifications ont l'ancienne structure
    const withStateField = await prisma.$runCommandRaw({
      find: 'Notification',
      filter: { state: { $exists: true } },
      limit: 1,
    });

    if ((withStateField as any).cursor?.firstBatch?.length > 0) {
      console.log('⚠️  PROBLÈME DÉTECTÉ: Des notifications ont encore un champ "state" en Json');
      console.log('   Ces notifications utilisent l\'ancienne structure et causeront des erreurs.\n');
      console.log('   Solution: Exécuter le script de migration ou nettoyer les notifications.\n');
    } else {
      console.log('✅ Toutes les notifications utilisent la nouvelle structure (state à la racine)\n');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNotificationStructure();
