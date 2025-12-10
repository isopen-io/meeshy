/**
 * TEST RAPIDE: Vérification basique du flux de traduction
 * 
 * Ce script effectue un test rapide pour vérifier:
 * 1. Connexion au WebSocket
 * 2. Envoi d'un message
 * 3. Réception des traductions
 * 
 * Usage: ts-node quick-translation-test.ts [conversationId]
 */

import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-1';
const TEST_USER_LANGUAGE = process.env.TEST_USER_LANGUAGE || 'fr';

interface TranslationEvent {
  messageId: string;
  translations: Array<{
    targetLanguage: string;
    translatedContent: string;
  }>;
}

async function quickTest(conversationId: string): Promise<void> {

  return new Promise((resolve, reject) => {
    let messageId: string | null = null;
    const receivedTranslations: string[] = [];
    let timeout: NodeJS.Timeout;

    // Créer le socket
    const socket: Socket = io(GATEWAY_URL, {
      auth: {
        userId: TEST_USER_ID,
        language: TEST_USER_LANGUAGE,
      },
      transports: ['websocket'],
      reconnection: false,
    });

    // Timeout global
    const globalTimeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timeout'));
    }, 30000);

    // Connexion établie
    socket.on('connect', () => {

      // Rejoindre la conversation
      socket.emit('conversation:join', { conversationId });

      // Attendre un peu puis envoyer le message
      setTimeout(() => {
        const testMessage = {
          conversationId,
          content: `Test rapide - ${new Date().toISOString()}`,
          originalLanguage: TEST_USER_LANGUAGE,
          messageType: 'text'
        };

        socket.emit('message:send', testMessage);

        // Timeout pour les traductions
        timeout = setTimeout(() => {
          printResults();
          cleanup();
        }, 10000);
      }, 1000);
    });

    // Message envoyé avec succès
    socket.on('message:sent', (data: any) => {
      messageId = data.messageId;
    });

    // Message original reçu
    socket.on('message:new', (data: any) => {
    });

    // Traduction reçue
    socket.on('message:translation', (data: TranslationEvent) => {
      
      if (data.translations && Array.isArray(data.translations)) {
        data.translations.forEach(translation => {
          receivedTranslations.push(translation.targetLanguage);
        });
      }
    });

    // Erreur
    socket.on('error', (error: any) => {
      console.error(`❌ Erreur: ${JSON.stringify(error)}`);
    });

    socket.on('connect_error', (error) => {
      console.error(`❌ Erreur de connexion: ${error.message}`);
      cleanup();
      reject(error);
    });

    socket.on('disconnect', (reason) => {
    });

    function printResults() {
      
      if (receivedTranslations.length > 0) {
      } else {
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      clearTimeout(globalTimeout);
      socket.disconnect();
      resolve();
    }
  });
}

// Point d'entrée
async function main() {
  const conversationId = process.argv[2];
  
  if (!conversationId) {
    console.error('❌ Erreur: ID de conversation requis');
    process.exit(1);
  }

  try {
    await quickTest(conversationId);
    process.exit(0);
  } catch (error) {
    console.error('❌ Test échoué:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { quickTest };

