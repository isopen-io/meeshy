#!/usr/bin/env node

/**
 * Script de nettoyage des traductions en doublon
 * 
 * Ce script identifie et supprime les traductions en doublon dans la base de données.
 * Un doublon est défini comme deux traductions ou plus avec le même messageId et targetLanguage.
 * 
 * Pour chaque groupe de doublons, seule la traduction la plus récente est conservée.
 * 
 * Usage: node scripts/cleanup-duplicate-translations.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Mode dry-run (simulation sans suppression)
const isDryRun = process.argv.includes('--dry-run');

async function findDuplicateTranslations() {
  console.log('🔍 Recherche des traductions en doublon...\n');

  // Récupérer toutes les traductions
  const allTranslations = await prisma.messageTranslation.findMany({
    orderBy: [
      { messageId: 'asc' },
      { targetLanguage: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  console.log(`📊 Total de traductions dans la base: ${allTranslations.length}\n`);

  // Grouper les traductions par messageId + targetLanguage
  const groups = new Map();
  
  for (const translation of allTranslations) {
    const key = `${translation.messageId}_${translation.targetLanguage}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    
    groups.get(key).push(translation);
  }

  // Identifier les groupes avec des doublons
  const duplicateGroups = Array.from(groups.entries())
    .filter(([key, translations]) => translations.length > 1);

  console.log(`🔍 Groupes avec doublons: ${duplicateGroups.length}\n`);

  let totalDuplicates = 0;
  const translationsToDelete = [];

  for (const [key, translations] of duplicateGroups) {
    const [messageId, targetLanguage] = key.split('_');
    const duplicateCount = translations.length - 1;
    totalDuplicates += duplicateCount;

    console.log(`📝 Message: ${messageId}`);
    console.log(`   🌐 Langue cible: ${targetLanguage}`);
    console.log(`   🔢 Nombre de traductions: ${translations.length}`);
    console.log(`   📅 Dates de création:`);
    
    translations.forEach((t, index) => {
      console.log(`      ${index === 0 ? '✅ GARDER' : '❌ SUPPRIMER'}: ${t.createdAt.toISOString()} (ID: ${t.id})`);
      if (index > 0) {
        translationsToDelete.push(t.id);
      }
    });
    
    console.log('');
  }

  return {
    totalTranslations: allTranslations.length,
    duplicateGroups: duplicateGroups.length,
    totalDuplicates,
    translationsToDelete
  };
}

async function cleanupDuplicates(translationsToDelete) {
  if (translationsToDelete.length === 0) {
    console.log('✅ Aucune traduction en doublon à supprimer.\n');
    return 0;
  }

  if (isDryRun) {
    console.log(`\n🔍 MODE DRY-RUN: ${translationsToDelete.length} traductions SERAIENT supprimées.\n`);
    return 0;
  }

  console.log(`\n🧹 Suppression de ${translationsToDelete.length} traductions en doublon...\n`);

  try {
    const result = await prisma.messageTranslation.deleteMany({
      where: {
        id: {
          in: translationsToDelete
        }
      }
    });

    console.log(`✅ ${result.count} traductions supprimées avec succès.\n`);
    return result.count;
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression:`, error);
    throw error;
  }
}

async function verifyCleanup() {
  console.log('🔍 Vérification après nettoyage...\n');

  const allTranslations = await prisma.messageTranslation.findMany({
    orderBy: [
      { messageId: 'asc' },
      { targetLanguage: 'asc' }
    ]
  });

  // Grouper et vérifier qu'il n'y a plus de doublons
  const groups = new Map();
  
  for (const translation of allTranslations) {
    const key = `${translation.messageId}_${translation.targetLanguage}`;
    
    if (!groups.has(key)) {
      groups.set(key, 0);
    }
    
    groups.set(key, groups.get(key) + 1);
  }

  const remainingDuplicates = Array.from(groups.values())
    .filter(count => count > 1).length;

  if (remainingDuplicates === 0) {
    console.log('✅ Aucun doublon restant détecté.\n');
  } else {
    console.log(`⚠️  ${remainingDuplicates} groupes de doublons restants détectés.\n`);
  }

  console.log(`📊 Total de traductions après nettoyage: ${allTranslations.length}\n`);
  
  return remainingDuplicates;
}

async function main() {
  try {
    console.log('🚀 Démarrage du script de nettoyage des traductions en doublon\n');
    console.log('=' .repeat(70));
    console.log('');

    if (isDryRun) {
      console.log('⚠️  MODE DRY-RUN ACTIVÉ - Aucune suppression ne sera effectuée\n');
    }

    // Étape 1: Identifier les doublons
    const stats = await findDuplicateTranslations();

    console.log('=' .repeat(70));
    console.log('📊 RÉSUMÉ\n');
    console.log(`   Total de traductions: ${stats.totalTranslations}`);
    console.log(`   Groupes avec doublons: ${stats.duplicateGroups}`);
    console.log(`   Traductions en doublon: ${stats.totalDuplicates}`);
    console.log('=' .repeat(70));
    console.log('');

    // Étape 2: Nettoyer les doublons
    const deletedCount = await cleanupDuplicates(stats.translationsToDelete);

    if (!isDryRun && deletedCount > 0) {
      // Étape 3: Vérifier le nettoyage
      await verifyCleanup();
    }

    console.log('=' .repeat(70));
    console.log('✅ Script terminé avec succès\n');

    if (isDryRun) {
      console.log('💡 Pour effectuer réellement le nettoyage, lancez le script sans --dry-run\n');
    }

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter le script
main();

