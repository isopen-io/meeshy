#!/usr/bin/env node
/**
 * Migration: Ajouter des index pour optimiser la requête GET /conversations
 *
 * Optimisations :
 * 1. Index sur Conversation(isActive) pour filtrer les conversations actives
 * 2. Index sur Conversation(lastMessageAt) pour trier par activité récente
 * 3. Index composite sur Message(conversationId, isDeleted, createdAt) pour lastMessage query
 *
 * Performance attendue :
 * - conversationsQuery: 350ms → ~80ms
 * - Élimination requête validUserIds: 9ms → 0ms
 * - Total: 549ms → ~250ms
 */

const { MongoClient } = require('mongodb');

// Configuration depuis .env ou arguments
const MONGODB_URI = process.env.MONGODB_URI || process.argv[2];
const DATABASE_NAME = process.env.DATABASE_NAME || process.argv[3] || 'meeshy';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI requis');
  console.error('Usage: node add-conversations-optimization-indexes.js <MONGODB_URI> [DATABASE_NAME]');
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

    // ===================================================================
    // 1. Index sur Conversation(isActive)
    // ===================================================================
    console.log('\n📊 Ajout de l\'index sur Conversation(isActive)...');
    const conversationCollection = db.collection('Conversation');

    let existingIndexes = await conversationCollection.indexes();
    let indexExists = existingIndexes.some(idx =>
      idx.name === 'isActive_1' || idx.key?.isActive === 1
    );

    if (indexExists) {
      console.log('ℹ️  Index isActive déjà présent, skip');
    } else {
      await conversationCollection.createIndex(
        { isActive: 1 },
        {
          name: 'isActive_1',
          background: true
        }
      );
      console.log('✅ Index isActive créé avec succès');
    }

    // ===================================================================
    // 2. Index sur Conversation(lastMessageAt)
    // ===================================================================
    console.log('\n📊 Ajout de l\'index sur Conversation(lastMessageAt)...');

    existingIndexes = await conversationCollection.indexes();
    indexExists = existingIndexes.some(idx =>
      idx.name === 'lastMessageAt_1' || idx.key?.lastMessageAt === 1
    );

    if (indexExists) {
      console.log('ℹ️  Index lastMessageAt déjà présent, skip');
    } else {
      await conversationCollection.createIndex(
        { lastMessageAt: 1 },
        {
          name: 'lastMessageAt_1',
          background: true
        }
      );
      console.log('✅ Index lastMessageAt créé avec succès');
    }

    // ===================================================================
    // 3. Index composite sur Message(conversationId, isDeleted, createdAt)
    // ===================================================================
    console.log('\n📊 Ajout de l\'index composite sur Message(conversationId, isDeleted, createdAt)...');
    const messageCollection = db.collection('Message');

    existingIndexes = await messageCollection.indexes();
    indexExists = existingIndexes.some(idx =>
      idx.name === 'conversationId_isDeleted_createdAt_compound' ||
      (idx.key?.conversationId === 1 && idx.key?.isDeleted === 1 && idx.key?.createdAt === 1)
    );

    if (indexExists) {
      console.log('ℹ️  Index composite conversationId_isDeleted_createdAt déjà présent, skip');
    } else {
      await messageCollection.createIndex(
        { conversationId: 1, isDeleted: 1, createdAt: 1 },
        {
          name: 'conversationId_isDeleted_createdAt_compound',
          background: true
        }
      );
      console.log('✅ Index composite conversationId_isDeleted_createdAt créé avec succès');
    }

    // Afficher les statistiques
    console.log('\n📈 Statistiques des collections:');
    const convStats = await conversationCollection.stats();
    const msgStats = await messageCollection.stats();

    console.log(`  Conversation: ${convStats.count} documents, ${Math.round(convStats.size / 1024 / 1024)}MB`);
    console.log(`  Message: ${msgStats.count} documents, ${Math.round(msgStats.size / 1024 / 1024)}MB`);

    console.log('\n✅ Migration terminée avec succès !');
    console.log('\n📊 Index créés :');
    console.log('  1. Conversation(isActive) - Filtre conversations actives');
    console.log('  2. Conversation(lastMessageAt) - Tri par activité récente');
    console.log('  3. Message(conversationId, isDeleted, createdAt) - Requête lastMessage optimisée');

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
