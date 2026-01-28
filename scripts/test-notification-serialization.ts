/**
 * Script de test : Vérifier la sérialisation des notifications
 *
 * Ce script teste si toutes les notifications peuvent être sérialisées en JSON
 * sans erreur "Invalid time value"
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Charger les variables d'environnement
config({ path: resolve(__dirname, '../services/gateway/.env') });

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  notificationId: string;
  success: boolean;
  error?: string;
  invalidFields?: string[];
}

/**
 * Teste la sérialisation d'une notification
 */
function testNotificationSerialization(notification: any): TestResult {
  const result: TestResult = {
    notificationId: notification.id,
    success: true,
    invalidFields: [],
  };

  try {
    // Tester chaque date individuellement
    const dateFields = [
      { name: 'createdAt', value: notification.createdAt },
      { name: 'readAt', value: notification.readAt },
      { name: 'expiresAt', value: notification.expiresAt },
    ];

    for (const field of dateFields) {
      if (field.value) {
        try {
          const date = new Date(field.value);
          if (isNaN(date.getTime())) {
            result.invalidFields!.push(field.name);
            result.success = false;
          } else {
            // Tester la conversion en ISO string
            date.toISOString();
          }
        } catch (error) {
          result.invalidFields!.push(field.name);
          result.success = false;
          result.error = `${field.name}: ${error}`;
        }
      }
    }

    // Tenter de sérialiser toute la notification en JSON
    JSON.stringify(notification);
  } catch (error: any) {
    result.success = false;
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('🧪 Test de sérialisation des notifications...\n');

  try {
    // Récupérer toutes les notifications
    const notifications = await prisma.notification.findMany({
      take: 100,
    });

    console.log(`📊 Nombre de notifications à tester : ${notifications.length}\n`);

    const results: TestResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const notification of notifications) {
      const result = testNotificationSerialization(notification);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        console.log(`❌ Échec de sérialisation : ${notification.id}`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Champs invalides: ${result.invalidFields?.join(', ')}`);
        if (result.error) {
          console.log(`   Erreur: ${result.error}`);
        }
        console.log(`   createdAt: ${JSON.stringify(notification.createdAt)}`);
        console.log(`   readAt: ${JSON.stringify(notification.readAt)}`);
        console.log(`   expiresAt: ${JSON.stringify(notification.expiresAt)}`);
        console.log('');
      }
    }

    console.log('\n📊 Résultats des tests :');
    console.log(`  ✅ Réussites : ${successCount}`);
    console.log(`  ❌ Échecs : ${failureCount}`);

    if (failureCount > 0) {
      console.log('\n⚠️  Des notifications ne peuvent pas être sérialisées correctement !');
      console.log('   Exécutez le script de correction : pnpm run fix:notification-dates');
      process.exit(1);
    } else {
      console.log('\n✅ Toutes les notifications peuvent être sérialisées correctement !');
    }
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
