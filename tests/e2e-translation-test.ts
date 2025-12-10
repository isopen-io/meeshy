/**
 * TEST END-TO-END: Flux complet de traduction de messages Meeshy
 * 
 * Ce test simule le parcours complet d'un utilisateur qui envoie un message
 * et vérifie que toutes les traductions attendues sont reçues par les participants.
 * 
 * Objectif: Identifier pourquoi un utilisateur ne reçoit qu'une seule traduction
 * au lieu de toutes les traductions pour les langues des participants.
 */

import { io, Socket } from 'socket.io-client';
import { PrismaClient } from '../shared/prisma/client';

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
const TEST_CONVERSATION_ID = process.env.TEST_CONVERSATION_ID || 'meeshy'; // ID de la conversation de test
const TEST_TIMEOUT = 30000; // 30 secondes

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color: keyof typeof colors, prefix: string, message: string) {
}

interface TestUser {
  id: string;
  username: string;
  language: string;
  systemLanguage: string;
  socket?: Socket;
  token?: string;
  receivedTranslations: Array<{
    messageId: string;
    targetLanguage: string;
    translatedContent: string;
    timestamp: Date;
  }>;
  receivedMessages: Array<{
    messageId: string;
    content: string;
    originalLanguage: string;
    timestamp: Date;
  }>;
}

interface TranslationData {
  messageId: string;
  translations: Array<{
    id: string;
    targetLanguage: string;
    translatedContent: string;
    sourceLanguage: string;
  }>;
}

class TranslationE2ETest {
  private prisma: PrismaClient;
  private testUsers: TestUser[] = [];
  private conversationId: string;
  private sentMessageId: string | null = null;
  private expectedLanguages: Set<string> = new Set();
  private receivedTranslationLanguages: Set<string> = new Set();
  private testStartTime: number = 0;

  constructor(conversationId: string) {
    this.prisma = new PrismaClient();
    this.conversationId = conversationId;
  }

  /**
   * Phase 1: Configuration du test - Récupération des informations de la conversation
   */
  async setup(): Promise<void> {
    log('blue', '📋 [SETUP]', 'Initialisation du test...');
    
    try {
      // Vérifier que la conversation existe
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: this.conversationId },
        include: {
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  systemLanguage: true,
                  regionalLanguage: true,
                  customDestinationLanguage: true,
                  autoTranslateEnabled: true,
                  translateToSystemLanguage: true,
                  translateToRegionalLanguage: true,
                  useCustomDestination: true,
                }
              }
            }
          },
          anonymousParticipants: {
            where: { isActive: true },
            select: {
              id: true,
              sessionToken: true,
              language: true,
            }
          }
        }
      });

      if (!conversation) {
        throw new Error(`❌ Conversation "${this.conversationId}" non trouvée`);
      }

      log('green', '✅ [SETUP]', `Conversation trouvée: ${conversation.title || conversation.id}`);
      log('cyan', '📊 [SETUP]', `Membres: ${conversation.members.length}, Anonymes: ${conversation.anonymousParticipants.length}`);

      // Construire la liste des utilisateurs de test
      for (const member of conversation.members) {
        const user = member.user;
        
        // Ajouter la langue système
        if (user.systemLanguage) {
          this.expectedLanguages.add(user.systemLanguage);
        }

        // Ajouter les langues additionnelles si traduction automatique activée
        if (user.autoTranslateEnabled) {
          if (user.translateToRegionalLanguage && user.regionalLanguage) {
            this.expectedLanguages.add(user.regionalLanguage);
          }
          if (user.useCustomDestination && user.customDestinationLanguage) {
            this.expectedLanguages.add(user.customDestinationLanguage);
          }
        }

        this.testUsers.push({
          id: user.id,
          username: user.username,
          language: user.systemLanguage || 'en',
          systemLanguage: user.systemLanguage || 'en',
          receivedTranslations: [],
          receivedMessages: []
        });
      }

      // Ajouter les participants anonymes
      for (const participant of conversation.anonymousParticipants) {
        if (participant.language) {
          this.expectedLanguages.add(participant.language);
        }
      }

      log('magenta', '🌍 [SETUP]', `Langues attendues: ${Array.from(this.expectedLanguages).join(', ')}`);
      log('blue', '👥 [SETUP]', `Utilisateurs de test: ${this.testUsers.length}`);

      // Afficher les détails des utilisateurs
      this.testUsers.forEach(user => {
        log('cyan', '  👤', `${user.username} (${user.systemLanguage})`);
      });

    } catch (error) {
      log('red', '❌ [SETUP]', `Erreur: ${error}`);
      throw error;
    }
  }

  /**
   * Phase 2: Connexion des utilisateurs au WebSocket
   */
  async connectUsers(): Promise<void> {
    log('blue', '🔌 [CONNECT]', 'Connexion des utilisateurs au WebSocket...');

    const connectionPromises = this.testUsers.map(async (user, index) => {
      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Timeout connexion pour ${user.username}`));
        }, 10000);

        // Récupérer un token JWT valide pour l'utilisateur
        // Note: En production, il faudrait authentifier via l'API
        // Pour ce test, on suppose que les tokens sont disponibles
        const socket = io(GATEWAY_URL, {
          auth: {
            userId: user.id,
            language: user.systemLanguage,
          },
          transports: ['websocket'],
          reconnection: false,
        });

        socket.on('connect', () => {
          clearTimeout(timeoutId);
          log('green', '✅ [CONNECT]', `${user.username} connecté (${socket.id})`);
          
          // Rejoindre la conversation
          socket.emit('conversation:join', { conversationId: this.conversationId });
          
          setTimeout(() => resolve(), 500); // Attendre un peu pour que le join soit effectif
        });

        socket.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          log('red', '❌ [CONNECT]', `Erreur connexion ${user.username}: ${error.message}`);
          reject(error);
        });

        socket.on('disconnect', (reason) => {
          log('yellow', '⚠️ [CONNECT]', `${user.username} déconnecté: ${reason}`);
        });

        // Écouter les messages originaux
        socket.on('message:new', (data: any) => {
          log('cyan', `📨 [${user.username}]`, `Message reçu: ${data.id || data.messageId}`);
          user.receivedMessages.push({
            messageId: data.id || data.messageId,
            content: data.content,
            originalLanguage: data.originalLanguage,
            timestamp: new Date()
          });
        });

        // Écouter les traductions
        socket.on('message:translation', (data: TranslationData) => {
          const translationCount = data.translations?.length || 0;
          log('magenta', `🌐 [${user.username}]`, 
            `Traduction reçue pour message ${data.messageId}: ${translationCount} langue(s)`);
          
          // Enregistrer chaque traduction
          if (data.translations && Array.isArray(data.translations)) {
            data.translations.forEach(translation => {
              log('cyan', `  ➜ [${user.username}]`, 
                `${translation.sourceLanguage} → ${translation.targetLanguage}: "${translation.translatedContent.substring(0, 50)}..."`);
              
              user.receivedTranslations.push({
                messageId: data.messageId,
                targetLanguage: translation.targetLanguage,
                translatedContent: translation.translatedContent,
                timestamp: new Date()
              });

              // Ajouter la langue à l'ensemble des traductions reçues
              this.receivedTranslationLanguages.add(translation.targetLanguage);
            });
          }
        });

        // Écouter les erreurs
        socket.on('error', (error: any) => {
          log('red', `❌ [${user.username}]`, `Erreur: ${JSON.stringify(error)}`);
        });

        user.socket = socket;
      });
    });

    try {
      await Promise.all(connectionPromises);
      log('green', '✅ [CONNECT]', `Tous les utilisateurs connectés (${this.testUsers.length})`);
    } catch (error) {
      log('red', '❌ [CONNECT]', `Erreur lors de la connexion: ${error}`);
      throw error;
    }
  }

  /**
   * Phase 3: Envoi d'un message de test
   */
  async sendTestMessage(): Promise<void> {
    log('blue', '📤 [SEND]', 'Envoi du message de test...');

    const sender = this.testUsers[0]; // Premier utilisateur envoie le message
    if (!sender || !sender.socket) {
      throw new Error('Aucun utilisateur connecté pour envoyer le message');
    }

    const testMessage = {
      conversationId: this.conversationId,
      content: `Test de traduction multilingue - ${new Date().toISOString()}`,
      originalLanguage: sender.systemLanguage,
      messageType: 'text'
    };

    log('cyan', '📝 [SEND]', `Contenu: "${testMessage.content}"`);
    log('cyan', '📝 [SEND]', `Langue: ${testMessage.originalLanguage}`);
    log('cyan', '📝 [SEND]', `Expéditeur: ${sender.username}`);

    this.testStartTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout lors de l\'envoi du message'));
      }, 5000);

      // Écouter la confirmation d'envoi
      sender.socket!.once('message:sent', (data: any) => {
        clearTimeout(timeoutId);
        this.sentMessageId = data.messageId;
        log('green', '✅ [SEND]', `Message envoyé avec succès: ${this.sentMessageId}`);
        resolve();
      });

      // Écouter les erreurs
      sender.socket!.once('error', (error: any) => {
        clearTimeout(timeoutId);
        log('red', '❌ [SEND]', `Erreur d'envoi: ${JSON.stringify(error)}`);
        reject(error);
      });

      // Envoyer le message
      sender.socket!.emit('message:send', testMessage);
    });
  }

  /**
   * Phase 4: Attendre les traductions
   */
  async waitForTranslations(timeout: number = 15000): Promise<void> {
    log('blue', '⏳ [WAIT]', `Attente des traductions (${timeout / 1000}s max)...`);
    
    const startTime = Date.now();
    const checkInterval = 500; // Vérifier toutes les 500ms

    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const totalTranslations = this.testUsers.reduce(
          (sum, user) => sum + user.receivedTranslations.length, 
          0
        );

        // Filtrer pour ne compter que les traductions du message envoyé
        const relevantTranslations = this.testUsers.reduce(
          (sum, user) => sum + user.receivedTranslations.filter(
            t => t.messageId === this.sentMessageId
          ).length,
          0
        );

        log('yellow', '⏱️  [WAIT]', 
          `${elapsed / 1000}s - ${relevantTranslations} traduction(s) reçue(s) / ${this.expectedLanguages.size} attendue(s)`);

        // Conditions d'arrêt
        if (elapsed >= timeout) {
          clearInterval(intervalId);
          log('yellow', '⚠️ [WAIT]', 'Timeout atteint');
          resolve();
        }
      }, checkInterval);
    });
  }

  /**
   * Phase 5: Analyse des résultats
   */
  async analyzeResults(): Promise<void> {
    log('blue', '📊 [ANALYZE]', 'Analyse des résultats...');

    const totalElapsed = Date.now() - this.testStartTime;
    log('cyan', '⏱️  [ANALYZE]', `Temps total: ${totalElapsed}ms`);


    // 1. Statistiques globales

    // 2. Détails par utilisateur
    
    this.testUsers.forEach(user => {
      const relevantTranslations = user.receivedTranslations.filter(
        t => t.messageId === this.sentMessageId
      );
      const relevantMessages = user.receivedMessages.filter(
        m => m.messageId === this.sentMessageId
      );

      
      if (relevantTranslations.length > 0) {
        const languagesReceived = new Set(relevantTranslations.map(t => t.targetLanguage));
        languagesReceived.forEach(lang => {
        });
      } else {
      }
    });


    // 3. Comparaison attendu vs reçu
    
    const missingLanguages = Array.from(this.expectedLanguages).filter(
      lang => !this.receivedTranslationLanguages.has(lang)
    );
    
    
    if (missingLanguages.length > 0) {
    } else {
    }


    // 4. Vérification en base de données
    
    if (this.sentMessageId) {
      const dbTranslations = await this.prisma.messageTranslation.findMany({
        where: { messageId: this.sentMessageId },
        select: {
          id: true,
          targetLanguage: true,
          translatedContent: true,
          createdAt: true,
        }
      });

      
      if (dbTranslations.length > 0) {
        dbTranslations.forEach(translation => {
        });
      }

      // Comparer avec ce qui a été reçu via WebSocket
      const dbLanguages = new Set(dbTranslations.map(t => t.targetLanguage));
      const notReceivedViaSocket = Array.from(dbLanguages).filter(
        lang => !this.receivedTranslationLanguages.has(lang)
      );

      if (notReceivedViaSocket.length > 0) {
      }
    }


    // 5. Verdict final
    
    const allUsersReceivedMessage = this.testUsers.every(
      user => user.receivedMessages.some(m => m.messageId === this.sentMessageId)
    );

    const allUsersReceivedTranslations = this.testUsers.every(
      user => user.receivedTranslations.some(t => t.messageId === this.sentMessageId)
    );

    const allLanguagesReceived = missingLanguages.length === 0;


    if (allUsersReceivedMessage && allUsersReceivedTranslations && allLanguagesReceived) {
    } else {
      
      // Diagnostics supplémentaires
      
      if (!allUsersReceivedMessage) {
        const usersWithoutMessage = this.testUsers.filter(
          user => !user.receivedMessages.some(m => m.messageId === this.sentMessageId)
        );
      }

      if (!allUsersReceivedTranslations) {
        const usersWithoutTranslations = this.testUsers.filter(
          user => !user.receivedTranslations.some(t => t.messageId === this.sentMessageId)
        );
      }

      if (!allLanguagesReceived) {
      }
    }

  }

  /**
   * Phase 6: Nettoyage
   */
  async cleanup(): Promise<void> {
    log('blue', '🧹 [CLEANUP]', 'Nettoyage...');

    // Déconnecter tous les sockets
    for (const user of this.testUsers) {
      if (user.socket) {
        user.socket.disconnect();
        log('cyan', '🔌 [CLEANUP]', `${user.username} déconnecté`);
      }
    }

    // Fermer la connexion Prisma
    await this.prisma.$disconnect();
    log('green', '✅ [CLEANUP]', 'Nettoyage terminé');
  }

  /**
   * Exécuter le test complet
   */
  async run(): Promise<void> {
    try {
      await this.setup();
      await this.connectUsers();
      await this.sendTestMessage();
      await this.waitForTranslations(15000);
      await this.analyzeResults();
    } catch (error) {
      log('red', '❌ [ERROR]', `Erreur durant le test: ${error}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Exécution du test
async function main() {

  const conversationId = process.argv[2] || TEST_CONVERSATION_ID;
  
  log('cyan', '🚀 [MAIN]', `Conversation cible: ${conversationId}`);
  log('cyan', '🚀 [MAIN]', `Gateway URL: ${GATEWAY_URL}`);
  
  const test = new TranslationE2ETest(conversationId);
  
  try {
    await test.run();
    process.exit(0);
  } catch (error) {
    log('red', '❌ [MAIN]', `Test échoué: ${error}`);
    process.exit(1);
  }
}

// Lancer le test
if (require.main === module) {
  main().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

export { TranslationE2ETest };

