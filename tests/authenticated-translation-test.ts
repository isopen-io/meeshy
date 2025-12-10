/**
 * TEST AUTHENTIFIÉ: Test de traduction avec utilisateur authentifié
 * 
 * Ce test s'authentifie avec admin:admin123 puis teste le flux de traduction
 */

import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

interface AuthResponse {
  success: boolean;
  data?: {
    user: any;
    token: string;
  };
  error?: string;
}

interface TranslationEvent {
  messageId: string;
  translation: {
    id?: string;
    targetLanguage: string;
    translatedContent: string;
    sourceLanguage?: string;
  };
}

async function authenticateUser(username: string, password: string): Promise<string> {
  
  const response = await fetch(`${GATEWAY_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Authentification échouée: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as AuthResponse;
  
  if (!data.success || !data.data?.token) {
    throw new Error(`Authentification échouée: ${data.error || 'Token manquant'}`);
  }

  return data.data.token;
}

async function runAuthenticatedTest(
  username: string,
  password: string,
  conversationId: string
): Promise<void> {

  return new Promise(async (resolve, reject) => {
    try {
      // 1. Authentification
      const token = await authenticateUser(username, password);

      let messageId: string | null = null;
      const receivedTranslations: Array<{
        language: string;
        content: string;
        timestamp: Date;
      }> = [];
      let timeout: NodeJS.Timeout;

      // 2. Connexion WebSocket avec token JWT
      const socket: Socket = io(GATEWAY_URL, {
        auth: {
          authToken: token, // Token JWT dans authToken
          tokenType: 'jwt',  // Spécifier que c'est un token JWT
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
            content: `Test authentifié - ${new Date().toISOString()}`,
            originalLanguage: 'fr',
            messageType: 'text'
          };

          socket.emit('message:send', testMessage);

          // Timeout pour les traductions
          timeout = setTimeout(() => {
            printResults();
            cleanup();
          }, 15000);
        }, 1000);
      });

      // Message envoyé avec succès
      socket.on('message:sent', (data: any) => {
        messageId = data.messageId;
      });

      // Message original reçu
      socket.on('message:new', (data: any) => {
      });

      // Traduction reçue - ÉVÉNEMENT CLÉ À OBSERVER
      // FORMAT: Une traduction par événement (diffusion immédiate)
      socket.on('message:translation', (data: TranslationEvent) => {
        
        if (data.translation) {
          
          receivedTranslations.push({
            language: data.translation.targetLanguage,
            content: data.translation.translatedContent,
            timestamp: new Date()
          });
        } else {
        }
      });

      // Erreur
      socket.on('error', (error: any) => {
        console.error(`❌ Erreur WebSocket: ${JSON.stringify(error)}`);
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
          const uniqueLanguages = [...new Set(receivedTranslations.map(t => t.language))];
          uniqueLanguages.forEach(lang => {
            const count = receivedTranslations.filter(t => t.language === lang).length;
          });
          
          
          // Vérifier si toutes les langues attendues sont reçues
          // Pour la conversation "meeshy", on devrait avoir au moins 2-3 langues
          if (uniqueLanguages.length >= 2) {
          } else if (uniqueLanguages.length === 1) {
          }
        } else {
        }
      }

      function cleanup() {
        clearTimeout(timeout);
        clearTimeout(globalTimeout);
        socket.disconnect();
        resolve();
      }

    } catch (error) {
      console.error('❌ Erreur durant le test:', error);
      reject(error);
    }
  });
}

// Point d'entrée
async function main() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  const conversationId = process.argv[4] || 'meeshy';
  
  try {
    await runAuthenticatedTest(username, password, conversationId);
    process.exit(0);
  } catch (error) {
    console.error('❌ Test échoué:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { runAuthenticatedTest };

