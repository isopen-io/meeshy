#!/usr/bin/env node
/**
 * Migration: Ajouter des index composés pour optimiser les requêtes getUserStats
 *
 * Optimisations :
 * 1. Index composite sur ConversationMember(userId, isActive) pour accélérer la recherche des conversations actives
 * 2. Index sur Conversation(type) si pas déjà présent
 *
 * Performance attendue :
 * - getConversationIds: 200ms → <50ms
 */

const { MongoClient } = require('mongodb');

// Configuration depuis .env ou arguments
const MONGODB_URI = process.env.MONGODB_URI || process.argv[2];
const DATABASE_NAME = process.env.DATABASE_NAME || process.argv[3] || 'meeshy';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI requis');
  console.error('Usage: node add-conversationmember-indexes.js <MONGODB_URI> [DATABASE_NAME]');
  console.error('Ou définir MONGODB_URI et DATABASE_NAME dans .env');
  process.exit(1);
}

async function addIndexes() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connexion à MongoDB...');
    await client.connect();
    console.log('✅ Connecté à MongoDB');

    const db = client.db(DATABASE_NAME);

    // 1. Index composite sur ConversationMember(userId, isActive)
    console.log('\n📊 Ajout de l\'index composite sur ConversationMember(userId, isActive)...');
    const conversationMemberCollection = db.collection('ConversationMember');

    // Vérifier si l'index existe déjà
    const existingIndexes = await conversationMemberCollection.indexes();
    const indexExists = existingIndexes.some(idx =>
      idx.name === 'userId_isActive_compound' ||
      (idx.key?.userId === 1 && idx.key?.isActive === 1)
    );

    if (indexExists) {
      console.log('ℹ️  Index userId_isActive déjà présent, skip');
    } else {
      await conversationMemberCollection.createIndex(
        { userId: 1, isActive: 1 },
        {
          name: 'userId_isActive_compound',
          background: true // Créer en arrière-plan pour ne pas bloquer les opérations
        }
      );
      console.log('✅ Index userId_isActive créé avec succès');
    }

    // 2. Index sur Conversation(type) si pas déjà présent
    console.log('\n📊 Vérification de l\'index sur Conversation(type)...');
    const conversationCollection = db.collection('Conversation');

    const convIndexes = await conversationCollection.indexes();
    const typeIndexExists = convIndexes.some(idx =>
      idx.name === 'type_1' || idx.key?.type === 1
    );

    if (typeIndexExists) {
      console.log('ℹ️  Index sur type déjà présent, skip');
    } else {
      await conversationCollection.createIndex(
        { type: 1 },
        {
          name: 'type_1',
          background: true
        }
      );
      console.log('✅ Index sur type créé avec succès');
    }

    // Afficher les statistiques
    console.log('\n📈 Statistiques des collections:');
    const cmStats = await conversationMemberCollection.stats();
    const convStats = await conversationCollection.stats();

    console.log(`  ConversationMember: ${cmStats.count} documents, ${Math.round(cmStats.size / 1024 / 1024)}MB`);
    console.log(`  Conversation: ${convStats.count} documents, ${Math.round(convStats.size / 1024 / 1024)}MB`);

    console.log('\n✅ Migration terminée avec succès !');
    console.log('\n📊 Index créés :');
    console.log('  1. ConversationMember(userId, isActive) - Accélère getUserStats');
    console.log('  2. Conversation(type) - Accélère les filtres par type');

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Connexion fermée');
  }
}

// Exécuter la migration
addIndexes().catch(console.error);
