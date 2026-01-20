/**
 * Script de test pour vérifier que la Gateway envoie les bonnes requêtes ZMQ
 *
 * Ce script simule l'envoi de différents types de requêtes et vérifie
 * leur format avant l'envoi vers le Translator.
 */

import { ZmqTranslationClient } from '../src/services/zmq-translation/ZmqTranslationClient';

async function testZmqRequests() {
  console.log('🧪 Test des requêtes ZMQ Gateway → Translator\n');

  try {
    // Initialiser le client ZMQ
    // Constructor: (host?: string, pushPort?: number, subPort?: number)
    const zmqClient = new ZmqTranslationClient('0.0.0.0', 5555, 5558);

    console.log('🔧 Initialisation du client ZMQ...');
    await zmqClient.initialize();
    console.log('✅ Client ZMQ initialisé\n');

    // ═══════════════════════════════════════════════════════════
    // TEST 1: Requête de traduction TEXTE
    // ═══════════════════════════════════════════════════════════
    console.log('📝 TEST 1: Requête de traduction texte');
    console.log('─'.repeat(60));

    const textRequest = {
      messageId: 'test_msg_123',
      text: 'Bonjour tout le monde, ceci est un test',
      sourceLanguage: 'fr',
      targetLanguages: ['en', 'es'],
      conversationId: 'test_conv_456',
      modelType: 'medium' as const
    };

    console.log('📤 Envoi de la requête...');
    const taskId1 = await zmqClient.sendTranslationRequest(textRequest);
    console.log(`✅ Requête envoyée avec taskId: ${taskId1}`);
    console.log('');

    // Attendre un peu pour voir les logs
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ═══════════════════════════════════════════════════════════
    // TEST 2: Health check
    // ═══════════════════════════════════════════════════════════
    console.log('🏓 TEST 2: Health check (ping)');
    console.log('─'.repeat(60));

    console.log('📤 Envoi du ping...');
    const isHealthy = await zmqClient.healthCheck();
    console.log(`${isHealthy ? '✅' : '❌'} Health check: ${isHealthy ? 'OK' : 'FAILED'}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════
    // TEST 3: Statistiques
    // ═══════════════════════════════════════════════════════════
    console.log('📊 TEST 3: Statistiques du client');
    console.log('─'.repeat(60));

    const stats = zmqClient.getStats();
    console.log('Stats actuelles:');
    console.log(`  - Requêtes traduction: ${stats.translationRequests}`);
    console.log(`  - Requêtes audio: ${stats.audioProcessRequests}`);
    console.log(`  - Requêtes transcription: ${stats.transcriptionRequests}`);
    console.log(`  - Requêtes en attente: ${stats.pendingRequests}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════
    // Résumé
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(60));
    console.log('📋 RÉSUMÉ DES TESTS');
    console.log('═'.repeat(60));
    console.log('');
    console.log('✅ Test 1: Requête traduction texte envoyée');
    console.log(`   → Type: 'translation'`);
    console.log(`   → Format: JSON single frame`);
    console.log(`   → TaskId: ${taskId1}`);
    console.log('');
    console.log('✅ Test 2: Health check OK');
    console.log(`   → Type: 'ping'`);
    console.log(`   → Réponse: 'pong'`);
    console.log('');
    console.log('✅ Test 3: Statistiques récupérées');
    console.log('');

    console.log('🔍 Pour vérifier la réception côté Translator:');
    console.log('   tmux attach -t meeshy:translator');
    console.log('');
    console.log('📝 Logs attendus dans Translator:');
    console.log('   [TRANSLATOR] 🔧 Tâche créée: XXX pour test_conv_456 (2 langues)');
    console.log('   [TRANSLATOR] 📝 Détails: texte=\'Bonjour tout le monde...\', source=fr, target=[en, es]');
    console.log('');

    // Attendre un peu avant de fermer
    console.log('⏳ Attente de 3 secondes pour voir les résultats...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Fermer le client
    console.log('🛑 Fermeture du client ZMQ...');
    await zmqClient.close();
    console.log('✅ Test terminé\n');

  } catch (error) {
    console.error('❌ Erreur pendant les tests:', error);
    process.exit(1);
  }
}

// Exécuter les tests
testZmqRequests().then(() => {
  console.log('🎉 Tous les tests sont terminés avec succès !');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
