/**
 * Script de migration : Corriger les dates invalides dans les notifications
 *
 * Problème : Certaines notifications ont des dates invalides (createdAt, readAt, expiresAt)
 * qui causent des erreurs "Invalid time value" lors de la sérialisation JSON
 *
 * Solution : Ce script identifie et corrige les notifications avec des dates invalides
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Charger les variables d'environnement depuis services/gateway/.env
config({ path: resolve(__dirname, '../../services/gateway/.env') });

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

interface Stats {
  total: number;
  invalidCreatedAt: number;
  invalidReadAt: number;
  invalidExpiresAt: number;
  fixed: number;
  deleted: number;
  errors: number;
}

/**
 * Vérifie si une date est valide
 */
function isValidDate(date: any): boolean {
  if (!date) return true; // null/undefined sont acceptables
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * Corrige une date invalide
 */
function fixDate(date: any, fallback: Date | null = null): Date | null {
  if (!date) return fallback;
  const d = new Date(date);
  return isNaN(d.getTime()) ? fallback : d;
}

async function main() {
  console.log('🔍 Recherche des notifications avec des dates invalides...\n');

  const stats: Stats = {
    total: 0,
    invalidCreatedAt: 0,
    invalidReadAt: 0,
    invalidExpiresAt: 0,
    fixed: 0,
    deleted: 0,
    errors: 0,
  };

  try {
    // Récupérer TOUTES les notifications
    const notifications = await prisma.notification.findMany();
    stats.total = notifications.length;

    console.log(`📊 Total de notifications à analyser : ${stats.total}\n`);

    // Identifier les notifications avec des dates invalides
    const invalidNotifications: any[] = [];

    for (const notif of notifications) {
      const hasInvalidCreatedAt = !isValidDate(notif.createdAt);
      const hasInvalidReadAt = notif.readAt && !isValidDate(notif.readAt);
      const hasInvalidExpiresAt = notif.expiresAt && !isValidDate(notif.expiresAt);

      if (hasInvalidCreatedAt || hasInvalidReadAt || hasInvalidExpiresAt) {
        invalidNotifications.push({
          id: notif.id,
          userId: notif.userId,
          type: notif.type,
          createdAt: notif.createdAt,
          readAt: notif.readAt,
          expiresAt: notif.expiresAt,
          hasInvalidCreatedAt,
          hasInvalidReadAt,
          hasInvalidExpiresAt,
        });

        if (hasInvalidCreatedAt) stats.invalidCreatedAt++;
        if (hasInvalidReadAt) stats.invalidReadAt++;
        if (hasInvalidExpiresAt) stats.invalidExpiresAt++;
      }
    }

    console.log(`❌ Notifications avec dates invalides : ${invalidNotifications.length}\n`);

    if (invalidNotifications.length > 0) {
      console.log('Détails des notifications invalides :');
      invalidNotifications.slice(0, 10).forEach((notif) => {
        console.log(`  - ID: ${notif.id}`);
        console.log(`    Type: ${notif.type}`);
        if (notif.hasInvalidCreatedAt) {
          console.log(`    ❌ createdAt invalide: ${JSON.stringify(notif.createdAt)}`);
        }
        if (notif.hasInvalidReadAt) {
          console.log(`    ❌ readAt invalide: ${JSON.stringify(notif.readAt)}`);
        }
        if (notif.hasInvalidExpiresAt) {
          console.log(`    ❌ expiresAt invalide: ${JSON.stringify(notif.expiresAt)}`);
        }
        console.log('');
      });

      if (invalidNotifications.length > 10) {
        console.log(`  ... et ${invalidNotifications.length - 10} autres\n`);
      }

      // Demander confirmation pour corriger
      console.log('🔧 Stratégie de correction :');
      console.log('  - Si createdAt invalide : supprimer la notification (donnée corrompue)');
      console.log('  - Si readAt invalide : mettre readAt à null');
      console.log('  - Si expiresAt invalide : mettre expiresAt à null\n');

      // Appliquer les corrections
      for (const notif of invalidNotifications) {
        try {
          // Si createdAt est invalide, supprimer la notification (donnée corrompue)
          if (notif.hasInvalidCreatedAt) {
            await prisma.notification.delete({
              where: { id: notif.id },
            });
            stats.deleted++;
            console.log(`🗑️  Notification supprimée (createdAt invalide) : ${notif.id}`);
          } else {
            // Sinon, corriger les autres champs
            const updateData: any = {};

            if (notif.hasInvalidReadAt) {
              updateData.readAt = null;
            }
            if (notif.hasInvalidExpiresAt) {
              updateData.expiresAt = null;
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.notification.update({
                where: { id: notif.id },
                data: updateData,
              });
              stats.fixed++;
              console.log(`✅ Notification corrigée : ${notif.id}`);
            }
          }
        } catch (error) {
          stats.errors++;
          console.error(`❌ Erreur lors de la correction de ${notif.id}:`, error);
        }
      }
    } else {
      console.log('✅ Aucune notification avec des dates invalides détectée !\n');
    }

    // Afficher le résumé
    console.log('\n📊 Résumé de la migration :');
    console.log(`  Total de notifications analysées : ${stats.total}`);
    console.log(`  Notifications avec createdAt invalide : ${stats.invalidCreatedAt}`);
    console.log(`  Notifications avec readAt invalide : ${stats.invalidReadAt}`);
    console.log(`  Notifications avec expiresAt invalide : ${stats.invalidExpiresAt}`);
    console.log(`  Notifications corrigées : ${stats.fixed}`);
    console.log(`  Notifications supprimées : ${stats.deleted}`);
    console.log(`  Erreurs rencontrées : ${stats.errors}`);
    console.log('');

    if (stats.errors === 0 && invalidNotifications.length > 0) {
      console.log('✅ Migration terminée avec succès !');
    } else if (stats.errors === 0) {
      console.log('✅ Aucune correction nécessaire !');
    } else {
      console.log('⚠️  Migration terminée avec des erreurs');
    }
  } catch (error) {
    console.error('❌ Erreur fatale lors de la migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter le script
main();
