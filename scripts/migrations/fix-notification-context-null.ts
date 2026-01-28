/**
 * Migration: Corriger les champs context null dans les notifications
 *
 * Problème:
 * - Le schema Prisma définit context comme Json (non-nullable)
 * - Anciennes notifications ont context: null
 * - Prisma échoue avec "Error converting field context of expected non-nullable type Json, found incompatible value of null"
 *
 * Solution:
 * - Remplacer context: null par context: {}
 * - Remplacer metadata: null par metadata: {}
 * - Remplacer actor: null par actor: null (actor est nullable)
 * - Remplacer delivery: null par delivery: { emailSent: false, pushSent: false }
 */

import { PrismaClient } from '../../packages/shared/prisma/client';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

interface NotificationRaw {
  id: string;
  context: any;
  metadata: any;
  delivery: any;
  actor: any;
}

async function fixNotificationContextNull() {
  console.log('🔍 Recherche des notifications avec context/metadata/delivery null...\n');

  try {
    // Récupérer toutes les notifications (Prisma va probablement échouer)
    // On va utiliser MongoDB directement via Prisma.$runCommandRaw
    const result = await prisma.$runCommandRaw({
      find: 'Notification',
      filter: {},
      projection: { _id: 1, context: 1, metadata: 1, delivery: 1, actor: 1 }
    });

    const notifications = (result as any).cursor.firstBatch as NotificationRaw[];

    console.log(`📊 Total de notifications trouvées: ${notifications.length}\n`);

    let contextNullCount = 0;
    let metadataNullCount = 0;
    let deliveryNullCount = 0;
    let fixedCount = 0;

    for (const notif of notifications) {
      const updates: any = {};
      let needsUpdate = false;

      // Vérifier context
      if (notif.context === null || notif.context === undefined) {
        updates.context = {};
        contextNullCount++;
        needsUpdate = true;
      }

      // Vérifier metadata
      if (notif.metadata === null || notif.metadata === undefined) {
        updates.metadata = {};
        metadataNullCount++;
        needsUpdate = true;
      }

      // Vérifier delivery
      if (notif.delivery === null || notif.delivery === undefined) {
        updates.delivery = { emailSent: false, pushSent: false };
        deliveryNullCount++;
        needsUpdate = true;
      }

      // Appliquer les mises à jour si nécessaire
      if (needsUpdate) {
        await prisma.$runCommandRaw({
          update: 'Notification',
          updates: [
            {
              q: { _id: { $oid: notif.id } },
              u: { $set: updates }
            }
          ]
        });
        fixedCount++;
      }
    }

    console.log('✅ Migration terminée:\n');
    console.log(`   - Notifications avec context null: ${contextNullCount}`);
    console.log(`   - Notifications avec metadata null: ${metadataNullCount}`);
    console.log(`   - Notifications avec delivery null: ${deliveryNullCount}`);
    console.log(`   - Total de notifications corrigées: ${fixedCount}\n`);

    if (fixedCount === 0) {
      console.log('✨ Aucune notification à corriger - tout est bon!\n');
    }

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter la migration
fixNotificationContextNull()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script échoué:', error);
    process.exit(1);
  });
