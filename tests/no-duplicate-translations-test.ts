/**
 * TEST DE VÉRIFICATION: Absence de doublons de traductions
 * 
 * Ce test vérifie spécifiquement que les corrections apportées pour éviter
 * les doublons de traductions fonctionnent correctement.
 * 
 * Scénario:
 * 1. Envoyer un message dans une conversation
 * 2. Attendre que les traductions soient générées
 * 3. Vérifier en base de données qu'il n'y a PAS de doublons
 * 4. Vérifier que les traductions reçues via WebSocket correspondent à la DB
 * 5. Vérifier la cohérence des données
 * 
 * Usage: ts-node tests/no-duplicate-translations-test.ts [conversationId] [username] [password]
 */

import { io, Socket } from 'socket.io-client';
import { PrismaClient } from '../gateway/shared/prisma/client';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

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
  translation?: {
    id?: string;
    targetLanguage: string;
    translatedContent: string;
    sourceLanguage?: string;
  };
  translations?: Array<{
    id?: string;
    targetLanguage: string;
    translatedContent: string;
    sourceLanguage?: string;
  }>;
}

interface ReceivedTranslation {
  targetLanguage: string;
  translatedContent: string;
  receivedAt: Date;
  eventCount: number; // Nombre de fois que cette traduction a été reçue via WebSocket
}

class NoDuplicateTranslationsTest {
  private prisma: PrismaClient;
  private socket?: Socket;
  private messageId?: string;
  private receivedTranslations: Map<string, ReceivedTranslation> = new Map(); // key: targetLanguage
  private conversationId: string;
  private token: string = '';
  private testStartTime: number = 0;

  constructor(conversationId: string) {
    this.prisma = new PrismaClient();
    this.conversationId = conversationId;
  }

  /**
   * Authentification
   */
  async authenticate(username: string, password: string): Promise<void> {
    log('blue', '🔐 [AUTH]', `Authentification avec ${username}...`);

    const response = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Authentification échouée: ${response.status}`);
    }

    const data = await response.json() as AuthResponse;
    
    if (!data.success || !data.data?.token) {
      throw new Error(`Authentification échouée: ${data.error || 'Token manquant'}`);
    }

    this.token = data.data.token;
    log('green', '✅ [AUTH]', `Authentifié: ${data.data.user.username}`);
  }

  /**
   * Connexion WebSocket
   */
  async connectWebSocket(): Promise<void> {
    log('blue', '🔌 [WEBSOCKET]', 'Connexion au WebSocket...');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout connexion WebSocket'));
      }, 10000);

      this.socket = io(GATEWAY_URL, {
        auth: {
          authToken: this.token,
          tokenType: 'jwt',
        },
        transports: ['websocket'],
        reconnection: false,
      });

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        log('green', '✅ [WEBSOCKET]', `Connecté (${this.socket!.id})`);
        
        // Rejoindre la conversation
        this.socket!.emit('conversation:join', { conversationId: this.conversationId });
        
        setTimeout(() => resolve(), 500);
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      // Écouter les messages
      this.socket.on('message:new', (data: any) => {
        log('cyan', '📨 [MSG]', `Message reçu: ${data.id || data.messageId}`);
      });

      // Écouter les traductions - DÉTECTION DES DOUBLONS ICI
      this.socket.on('message:translation', (data: TranslationEvent) => {
        log('magenta', '🌐 [TRANSLATION]', `Traduction reçue pour message ${data.messageId}`);
        
        // Support des deux formats (singulier et pluriel)
        let translations: Array<{ id?: string; targetLanguage: string; translatedContent: string; sourceLanguage?: string }> = [];
        
        if (data.translation) {
          translations = [data.translation];
        } else if (data.translations && Array.isArray(data.translations)) {
          translations = data.translations;
        }

        translations.forEach(translation => {
          const key = translation.targetLanguage;
          const existing = this.receivedTranslations.get(key);

          if (existing) {
            // DOUBLON DÉTECTÉ VIA WEBSOCKET!
            existing.eventCount++;
            log('red', '⚠️  [DUPLICATE]', 
              `Traduction ${key} reçue ${existing.eventCount} fois via WebSocket!`);
          } else {
            this.receivedTranslations.set(key, {
              targetLanguage: translation.targetLanguage,
              translatedContent: translation.translatedContent,
              receivedAt: new Date(),
              eventCount: 1
            });
            log('cyan', '  ➜ [TRANSLATION]', 
              `${translation.targetLanguage}: "${translation.translatedContent.substring(0, 50)}..."`);
          }
        });
      });

      this.socket.on('error', (error: any) => {
        log('red', '❌ [ERROR]', JSON.stringify(error));
      });
    });
  }

  /**
   * Envoyer un message de test
   */
  async sendTestMessage(): Promise<void> {
    log('blue', '📤 [SEND]', 'Envoi du message de test...');

    if (!this.socket) {
      throw new Error('Socket non connecté');
    }

    this.testStartTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout envoi message'));
      }, 5000);

      const testMessage = {
        conversationId: this.conversationId,
        content: `Test anti-doublons - ${new Date().toISOString()}`,
        originalLanguage: 'fr',
        messageType: 'text'
      };

      this.socket!.once('message:sent', (data: any) => {
        clearTimeout(timeoutId);
        this.messageId = data.messageId;
        log('green', '✅ [SEND]', `Message envoyé: ${this.messageId}`);
        resolve();
      });

      this.socket!.once('error', (error: any) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      log('cyan', '📝 [SEND]', `Contenu: "${testMessage.content}"`);
      this.socket!.emit('message:send', testMessage);
    });
  }

  /**
   * Attendre les traductions
   */
  async waitForTranslations(timeout: number = 15000): Promise<void> {
    log('blue', '⏳ [WAIT]', `Attente des traductions (${timeout / 1000}s max)...`);
    
    const startTime = Date.now();
    const checkInterval = 1000;

    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const translationCount = this.receivedTranslations.size;

        log('yellow', '⏱️  [WAIT]', 
          `${elapsed / 1000}s - ${translationCount} traduction(s) reçue(s)`);

        if (elapsed >= timeout) {
          clearInterval(intervalId);
          resolve();
        }
      }, checkInterval);
    });
  }

  /**
   * Vérifier la base de données - CŒUR DE LA VÉRIFICATION
   */
  async verifyDatabase(): Promise<{
    hasDuplicates: boolean;
    dbTranslations: any[];
    duplicateGroups: Map<string, any[]>;
  }> {
    log('blue', '🗄️  [DB-CHECK]', 'Vérification de la base de données...');

    if (!this.messageId) {
      throw new Error('Pas de messageId pour vérifier');
    }

    // Récupérer TOUTES les traductions pour ce message
    const dbTranslations = await this.prisma.messageTranslation.findMany({
      where: { messageId: this.messageId },
      select: {
        id: true,
        targetLanguage: true,
        translatedContent: true,
        sourceLanguage: true,
        createdAt: true,
        cacheKey: true,
      },
      orderBy: [
        { targetLanguage: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    log('cyan', '  📊 [DB-CHECK]', `Traductions en base: ${dbTranslations.length}`);

    // Grouper par langue cible pour détecter les doublons
    const groupsByLanguage = new Map<string, any[]>();
    
    for (const translation of dbTranslations) {
      const key = translation.targetLanguage;
      if (!groupsByLanguage.has(key)) {
        groupsByLanguage.set(key, []);
      }
      groupsByLanguage.get(key)!.push(translation);
    }

    // Identifier les doublons
    const duplicateGroups = new Map<string, any[]>();
    let hasDuplicates = false;

    for (const [language, translations] of groupsByLanguage) {
      if (translations.length > 1) {
        hasDuplicates = true;
        duplicateGroups.set(language, translations);
        log('red', '❌ [DUPLICATE-DB]', 
          `Langue ${language}: ${translations.length} traductions en base!`);
        
        translations.forEach((t, idx) => {
          log('yellow', '    ↳', 
            `[${idx + 1}] ID: ${t.id.substring(0, 8)}... créé: ${t.createdAt.toISOString()}`);
        });
      } else {
        log('green', '  ✅ [DB-CHECK]', `Langue ${language}: unique`);
      }
    }

    return { hasDuplicates, dbTranslations, duplicateGroups };
  }

  /**
   * Vérifier la cohérence WebSocket <-> DB
   */
  verifyConsistency(dbTranslations: any[]): {
    isConsistent: boolean;
    issues: string[];
  } {
    log('blue', '🔍 [CONSISTENCY]', 'Vérification de la cohérence...');

    const issues: string[] = [];
    
    // 1. Vérifier que chaque traduction DB a été reçue via WebSocket
    const dbLanguages = new Set(dbTranslations.map(t => t.targetLanguage));
    const wsLanguages = new Set(this.receivedTranslations.keys());

    for (const lang of dbLanguages) {
      if (!wsLanguages.has(lang)) {
        const issue = `Traduction ${lang} en DB mais NON reçue via WebSocket`;
        issues.push(issue);
        log('red', '❌ [INCONSISTENT]', issue);
      }
    }

    // 2. Vérifier que chaque traduction WebSocket existe en DB
    for (const lang of wsLanguages) {
      if (!dbLanguages.has(lang)) {
        const issue = `Traduction ${lang} reçue via WebSocket mais NON en DB`;
        issues.push(issue);
        log('red', '❌ [INCONSISTENT]', issue);
      }
    }

    // 3. Vérifier qu'aucune traduction n'a été reçue plusieurs fois via WebSocket
    for (const [lang, translation] of this.receivedTranslations) {
      if (translation.eventCount > 1) {
        const issue = `Traduction ${lang} reçue ${translation.eventCount} fois via WebSocket (doublon)`;
        issues.push(issue);
        log('red', '❌ [INCONSISTENT]', issue);
      }
    }

    const isConsistent = issues.length === 0;
    
    if (isConsistent) {
      log('green', '✅ [CONSISTENCY]', 'Données cohérentes entre WebSocket et DB');
    }

    return { isConsistent, issues };
  }

  /**
   * Rapport final
   */
  async generateReport(): Promise<void> {
    const elapsed = Date.now() - this.testStartTime;


    // 1. Informations générales

    // 2. Traductions reçues via WebSocket
    
    // Vérifier les doublons WebSocket
    let wsHasDuplicates = false;
    for (const [lang, translation] of this.receivedTranslations) {
      if (translation.eventCount > 1) {
        wsHasDuplicates = true;
      } else {
      }
    }

    // 3. Vérification base de données
    const { hasDuplicates, dbTranslations, duplicateGroups } = await this.verifyDatabase();
    
    
    const uniqueLanguages = new Set(dbTranslations.map(t => t.targetLanguage));

    if (hasDuplicates) {
      for (const [lang, translations] of duplicateGroups) {
      }
    } else {
    }

    // 4. Cohérence
    const { isConsistent, issues } = this.verifyConsistency(dbTranslations);
    
    if (isConsistent) {
    } else {
      issues.forEach(issue => {
      });
    }

    // 5. VERDICT FINAL

    const allChecks = [
      { name: 'Aucun doublon WebSocket', passed: !wsHasDuplicates },
      { name: 'Aucun doublon en base', passed: !hasDuplicates },
      { name: 'Données cohérentes', passed: isConsistent },
      { name: 'Traductions reçues', passed: this.receivedTranslations.size > 0 },
    ];

    allChecks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      const color = check.passed ? 'green' : 'red';
    });


    const allPassed = allChecks.every(c => c.passed);
    
    if (allPassed) {
    } else {
      
      if (wsHasDuplicates) {
      }
      
      if (hasDuplicates) {
      }
      
      if (!isConsistent) {
      }
    }

  }

  /**
   * Nettoyage
   */
  async cleanup(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
    }
    await this.prisma.$disconnect();
  }

  /**
   * Exécution complète du test
   */
  async run(username: string, password: string): Promise<boolean> {
    try {
      await this.authenticate(username, password);
      await this.connectWebSocket();
      await this.sendTestMessage();
      await this.waitForTranslations(15000);
      await this.generateReport();

      // Vérifier si le test a réussi
      const { hasDuplicates } = await this.verifyDatabase();
      const wsHasDuplicates = Array.from(this.receivedTranslations.values())
        .some(t => t.eventCount > 1);
      const { isConsistent } = this.verifyConsistency(
        await this.prisma.messageTranslation.findMany({
          where: { messageId: this.messageId }
        })
      );

      return !hasDuplicates && !wsHasDuplicates && isConsistent;
    } catch (error) {
      log('red', '❌ [ERROR]', `Erreur: ${error}`);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Point d'entrée
async function main() {

  const conversationId = process.argv[2] || 'meeshy';
  const username = process.argv[3] || 'admin';
  const password = process.argv[4] || 'admin123';

  log('cyan', '🚀 [MAIN]', `Conversation: ${conversationId}`);
  log('cyan', '🚀 [MAIN]', `User: ${username}`);
  log('cyan', '🚀 [MAIN]', `Gateway: ${GATEWAY_URL}`);

  const test = new NoDuplicateTranslationsTest(conversationId);
  
  try {
    const success = await test.run(username, password);
    process.exit(success ? 0 : 1);
  } catch (error) {
    log('red', '❌ [MAIN]', `Erreur fatale: ${error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

export { NoDuplicateTranslationsTest };

