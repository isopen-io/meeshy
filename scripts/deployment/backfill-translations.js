#!/usr/bin/env node

/**
 * Script de backfill pour créer les traductions manquantes
 * des messages existants dans la base de données
 * 
 * Ce script :
 * 1. Trouve tous les messages sans traduction
 * 2. Détermine les langues cibles depuis les membres de la conversation
 * 3. Envoie les requêtes de traduction au service Translator via TranslationService
 * 4. Traite les messages par batch pour éviter la surcharge
 * 
 * Usage:
 *   node backfill-translations.js [--batch-size=10] [--delay=2000] [--dry-run]
 */

const { PrismaClient } = require('../../gateway/shared/prisma/client');
const { TranslationService } = require('../../gateway/dist/src/services/TranslationService.js');

// Configuration
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 5;
const DELAY_MS = parseInt(process.argv.find(arg => arg.startsWith('--delay='))?.split('=')[1]) || 3000;
const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient();
let translationService;

/**
 * Pause l'exécution pendant un certain temps
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extrait les langues cibles depuis les membres d'une conversation
 */
async function getConversationTargetLanguages(conversationId) {
  const languages = new Set();
  
  // Récupérer les membres de la conversation
  const members = await prisma.conversationMember.findMany({
    where: {
      conversationId: conversationId,
      isActive: true
    },
    include: {
      user: {
        select: {
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: true,
          useCustomDestination: true
        }
      }
    }
  });
  
  // Extraire les langues selon les préférences des utilisateurs
  for (const member of members) {
    if (member.user.systemLanguage) {
      languages.add(member.user.systemLanguage);
    }
    
    if (member.user.autoTranslateEnabled) {
      if (member.user.translateToRegionalLanguage && member.user.regionalLanguage) {
        languages.add(member.user.regionalLanguage);
      }
      if (member.user.useCustomDestination && member.user.customDestinationLanguage) {
        languages.add(member.user.customDestinationLanguage);
      }
    }
  }
  
  return Array.from(languages);
}

/**
 * Trouve tous les messages sans traduction
 */
async function findMessagesWithoutTranslations() {
  console.log('🔍 Recherche des messages sans traduction...\n');
  
  // Récupérer tous les messages
  const allMessages = await prisma.message.findMany({
    where: {
      isDeleted: false
    },
    select: {
      id: true,
      conversationId: true,
      content: true,
      originalLanguage: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
  
  console.log(`📊 Total de messages: ${allMessages.length}`);
  
  // Pour chaque message, vérifier s'il a des traductions
  const messagesWithoutTranslations = [];
  
  for (const message of allMessages) {
    const translationCount = await prisma.messageTranslation.count({
      where: { messageId: message.id }
    });
    
    if (translationCount === 0) {
      messagesWithoutTranslations.push(message);
    }
  }
  
  console.log(`⚠️  Messages sans traduction: ${messagesWithoutTranslations.length}\n`);
  
  return messagesWithoutTranslations;
}

/**
 * Traite un batch de messages pour traduction
 */
async function processBatch(messages, batchNumber, totalBatches) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 BATCH ${batchNumber}/${totalBatches} (${messages.length} messages)`);
  console.log(`${'='.repeat(80)}\n`);
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    console.log(`[${i + 1}/${messages.length}] Message ${message.id}`);
    console.log(`   Content: ${message.content.substring(0, 60)}...`);
    console.log(`   Source language: ${message.originalLanguage}`);
    console.log(`   Conversation: ${message.conversationId}`);
    
    try {
      // Récupérer les langues cibles de la conversation
      const targetLanguages = await getConversationTargetLanguages(message.conversationId);
      console.log(`   Target languages: ${targetLanguages.join(', ')}`);
      
      // Filtrer les langues identiques à la langue source
      const filteredLanguages = targetLanguages.filter(lang => 
        lang !== message.originalLanguage
      );
      
      if (filteredLanguages.length === 0) {
        console.log(`   ✅ Aucune traduction nécessaire (langue source = langues cibles)\n`);
        continue;
      }
      
      console.log(`   📤 Langues à traduire: ${filteredLanguages.join(', ')}`);
      
      if (DRY_RUN) {
        console.log(`   🔸 [DRY RUN] Would send translation request for ${filteredLanguages.length} languages\n`);
        continue;
      }
      
      // Envoyer la requête de traduction via TranslationService
      await translationService.handleNewMessage({
        id: message.id, // ID existant pour déclencher une retraduction
        conversationId: message.conversationId,
        content: message.content,
        originalLanguage: message.originalLanguage,
        messageType: 'text'
      });
      
      console.log(`   ✅ Requête de traduction envoyée\n`);
      
      // Attendre un peu pour éviter de surcharger le système
      if (i < messages.length - 1) {
        await sleep(1000); // 1 seconde entre chaque message du même batch
      }
      
    } catch (error) {
      console.error(`   ❌ Erreur: ${error.message}\n`);
    }
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Script de backfill des traductions\n');
  console.log('Configuration:');
  console.log(`  - Taille des batchs: ${BATCH_SIZE}`);
  console.log(`  - Délai entre batchs: ${DELAY_MS}ms`);
  console.log(`  - Mode: ${DRY_RUN ? 'DRY RUN (simulation)' : 'PRODUCTION'}\n`);
  
  try {
    // Initialiser le TranslationService
    console.log('🔧 Initialisation du TranslationService...');
    translationService = new TranslationService(prisma);
    await translationService.initialize();
    console.log('✅ TranslationService initialisé\n');
    
    // Trouver les messages sans traduction
    const messages = await findMessagesWithoutTranslations();
    
    if (messages.length === 0) {
      console.log('✨ Aucun message sans traduction trouvé !');
      return;
    }
    
    // Diviser en batches
    const batches = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      batches.push(messages.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 ${batches.length} batches à traiter\n`);
    
    if (DRY_RUN) {
      console.log('⚠️  MODE DRY RUN - Aucune traduction ne sera réellement créée\n');
    }
    
    // Traiter chaque batch
    const startTime = Date.now();
    
    for (let i = 0; i < batches.length; i++) {
      await processBatch(batches[i], i + 1, batches.length);
      
      // Attendre entre les batches (sauf pour le dernier)
      if (i < batches.length - 1) {
        console.log(`⏳ Pause de ${DELAY_MS}ms avant le prochain batch...\n`);
        await sleep(DELAY_MS);
      }
    }
    
    // Attendre que les traductions soient traitées
    if (!DRY_RUN) {
      console.log('\n⏳ Attente de 10 secondes pour le traitement des traductions...\n');
      await sleep(10000);
      
      // Vérifier les résultats
      console.log('\n📊 Vérification des résultats...\n');
      
      const totalTranslations = await prisma.messageTranslation.count();
      const messagesWithTranslations = await prisma.messageTranslation.groupBy({
        by: ['messageId']
      });
      
      console.log(`✅ Total de traductions: ${totalTranslations}`);
      console.log(`✅ Messages avec traductions: ${messagesWithTranslations.length}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Durée totale: ${duration}s`);
    console.log('\n✨ Backfill terminé !');
    
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution
main();
