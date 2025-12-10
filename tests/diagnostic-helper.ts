/**
 * OUTIL DE DIAGNOSTIC: Aide au débogage du flux de traduction
 * 
 * Ce script se connecte aux logs et à la base de données pour
 * analyser en temps réel le flux de traduction.
 */

import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

// Couleurs
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

function log(color: keyof typeof colors, message: string) {
}

/**
 * Analyse une conversation et affiche les informations de diagnostic
 */
async function analyzeConversation(conversationId: string): Promise<void> {
  log('blue', '\n╔════════════════════════════════════════════════════════════╗');
  log('blue', '║  DIAGNOSTIC - Analyse de la conversation                 ║');
  log('blue', '╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Informations de base sur la conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        _count: {
          select: {
            members: true,
            messages: true,
            anonymousParticipants: true,
          }
        }
      }
    });

    if (!conversation) {
      log('red', `❌ Conversation "${conversationId}" non trouvée`);
      return;
    }

    log('cyan', `📋 Conversation: ${conversation.title || conversation.id}`);
    log('cyan', `   Type: ${conversation.type}`);
    log('cyan', `   Membres: ${conversation._count.members}`);
    log('cyan', `   Participants anonymes: ${conversation._count.anonymousParticipants}`);
    log('cyan', `   Messages: ${conversation._count.messages}\n`);

    // 2. Membres et leurs langues
    log('blue', '👥 MEMBRES ET LANGUES');
    
    const members = await prisma.conversationMember.findMany({
      where: {
        conversationId: conversationId,
        isActive: true
      },
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
    });

    const expectedLanguages = new Set<string>();

    members.forEach(member => {
      const user = member.user;
      log('cyan', `\n  👤 ${user.username} (${user.displayName || 'N/A'})`);
      log('cyan', `     Langue système: ${user.systemLanguage || 'N/A'}`);
      
      if (user.systemLanguage) {
        expectedLanguages.add(user.systemLanguage);
      }

      if (user.autoTranslateEnabled) {
        log('green', `     ✅ Traduction automatique activée`);
        
        if (user.translateToSystemLanguage) {
          log('cyan', `        → Langue système: ${user.systemLanguage}`);
        }
        
        if (user.translateToRegionalLanguage && user.regionalLanguage) {
          log('cyan', `        → Langue régionale: ${user.regionalLanguage}`);
          expectedLanguages.add(user.regionalLanguage);
        }
        
        if (user.useCustomDestination && user.customDestinationLanguage) {
          log('cyan', `        → Langue personnalisée: ${user.customDestinationLanguage}`);
          expectedLanguages.add(user.customDestinationLanguage);
        }
      } else {
        log('yellow', `     ⚠️  Traduction automatique désactivée`);
      }
    });

    // Participants anonymes
    const anonymousParticipants = await prisma.anonymousParticipant.findMany({
      where: {
        conversationId: conversationId,
        isActive: true
      },
      select: {
        id: true,
        sessionToken: true,
        language: true,
      }
    });

    if (anonymousParticipants.length > 0) {
      log('blue', '\n🕶️  PARTICIPANTS ANONYMES');
      anonymousParticipants.forEach(participant => {
        log('cyan', `  🕶️  ${participant.sessionToken?.substring(0, 10)}... (${participant.language || 'N/A'})`);
        if (participant.language) {
          expectedLanguages.add(participant.language);
        }
      });
    }

    log('magenta', `\n🌍 Langues attendues pour les traductions: ${Array.from(expectedLanguages).join(', ')}`);
    log('magenta', `   Total: ${expectedLanguages.size} langue(s) unique(s)\n`);

    // 3. Statistiques des messages récents
    log('blue', '📨 MESSAGES RÉCENTS (5 derniers)');
    
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        sender: {
          select: {
            username: true,
            displayName: true,
          }
        },
        translations: {
          select: {
            id: true,
            targetLanguage: true,
            createdAt: true,
          }
        },
        _count: {
          select: {
            translations: true
          }
        }
      }
    });

    if (recentMessages.length === 0) {
      log('yellow', '  ⚠️  Aucun message dans cette conversation');
    } else {
      for (const message of recentMessages) {
        const senderName = message.sender?.username || 'Anonyme';
        log('cyan', `\n  📨 Message ${message.id.substring(0, 8)}...`);
        log('cyan', `     De: ${senderName}`);
        log('cyan', `     Contenu: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
        log('cyan', `     Langue: ${message.originalLanguage}`);
        log('cyan', `     Date: ${message.createdAt.toISOString()}`);
        log('cyan', `     Traductions: ${message._count.translations}`);

        if (message.translations.length > 0) {
          const languages = message.translations.map(t => t.targetLanguage).join(', ');
          log('green', `     ✅ Langues traduites: ${languages}`);
          
          // Vérifier les langues manquantes
          const translatedLanguages = new Set(message.translations.map(t => t.targetLanguage));
          const missingLanguages = Array.from(expectedLanguages).filter(
            lang => lang !== message.originalLanguage && !translatedLanguages.has(lang)
          );
          
          if (missingLanguages.length > 0) {
            log('red', `     ❌ Langues manquantes: ${missingLanguages.join(', ')}`);
          }
        } else {
          log('red', `     ❌ Aucune traduction générée`);
        }
      }
    }

    // 4. Analyse du message le plus récent
    if (recentMessages.length > 0) {
      const latestMessage = recentMessages[0];
      
      log('blue', '\n🔍 ANALYSE DÉTAILLÉE DU DERNIER MESSAGE');
      log('cyan', `   Message ID: ${latestMessage.id}`);
      log('cyan', `   Langue source: ${latestMessage.originalLanguage}\n`);

      const allTranslations = await prisma.messageTranslation.findMany({
        where: { messageId: latestMessage.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          targetLanguage: true,
          translatedContent: true,
          translationModel: true,
          confidenceScore: true,
          createdAt: true,
        }
      });

      if (allTranslations.length === 0) {
        log('red', '   ❌ Aucune traduction trouvée en base de données');
        log('yellow', '\n   🔍 CAUSE POSSIBLE:');
        log('yellow', '      - Le service de traduction n\'est pas démarré');
        log('yellow', '      - La connexion ZMQ n\'est pas établie');
        log('yellow', '      - Le message a été envoyé mais les traductions n\'ont pas été générées');
      } else {
        log('green', `   ✅ ${allTranslations.length} traduction(s) en base de données\n`);

        allTranslations.forEach((translation, index) => {
          log('cyan', `   ${index + 1}. ${translation.targetLanguage.toUpperCase()}`);
          log('cyan', `      Contenu: "${translation.translatedContent.substring(0, 60)}..."`);
          log('cyan', `      Modèle: ${translation.translationModel || 'N/A'}`);
          log('cyan', `      Confiance: ${translation.confidenceScore || 'N/A'}`);
          log('cyan', `      Créé: ${translation.createdAt.toISOString()}`);
        });

        // Comparer avec les langues attendues
        const translatedLanguages = new Set(allTranslations.map(t => t.targetLanguage));
        const missingLanguages = Array.from(expectedLanguages).filter(
          lang => lang !== latestMessage.originalLanguage && !translatedLanguages.has(lang)
        );

        log('blue', '\n   📊 COMPARAISON');
        log('cyan', `      Langues attendues: ${Array.from(expectedLanguages).filter(l => l !== latestMessage.originalLanguage).join(', ')}`);
        log('cyan', `      Langues en base: ${Array.from(translatedLanguages).join(', ')}`);

        if (missingLanguages.length === 0) {
          log('green', '      ✅ Toutes les traductions attendues sont en base');
          log('yellow', '\n   💡 Si les clients ne reçoivent pas les traductions:');
          log('yellow', '      → Le problème est dans la diffusion WebSocket');
          log('yellow', '      → Vérifier MeeshySocketIOManager._handleTranslationReady()');
          log('yellow', '      → Vérifier que les clients sont dans la room de conversation');
        } else {
          log('red', `      ❌ Langues manquantes: ${missingLanguages.join(', ')}`);
          log('yellow', '\n   💡 CAUSE POSSIBLE:');
          log('yellow', '      → TranslationService._extractConversationLanguages() ne retourne pas toutes les langues');
          log('yellow', '      → Le filtrage des langues identiques retire trop de langues');
          log('yellow', '      → La requête ZMQ ne contient pas toutes les langues cibles');
        }
      }
    }

    log('blue', '\n╔════════════════════════════════════════════════════════════╗');
    log('blue', '║  FIN DU DIAGNOSTIC                                        ║');
    log('blue', '╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    log('red', `❌ Erreur durant le diagnostic: ${error}`);
    throw error;
  }
}

/**
 * Affiche les statistiques globales du système de traduction
 */
async function displayGlobalStats(): Promise<void> {
  log('blue', '\n╔════════════════════════════════════════════════════════════╗');
  log('blue', '║  STATISTIQUES GLOBALES                                    ║');
  log('blue', '╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Total des messages
    const totalMessages = await prisma.message.count();
    log('cyan', `📨 Total messages: ${totalMessages}`);

    // Total des traductions
    const totalTranslations = await prisma.messageTranslation.count();
    log('cyan', `🌐 Total traductions: ${totalTranslations}`);

    // Moyenne de traductions par message
    const avgTranslations = totalMessages > 0 ? (totalTranslations / totalMessages).toFixed(2) : 0;
    log('cyan', `📊 Moyenne traductions/message: ${avgTranslations}`);

    // Traductions par langue
    log('blue', '\n🌍 TRADUCTIONS PAR LANGUE');
    
    const translationsByLanguage = await prisma.$queryRaw<Array<{ targetLanguage: string; count: bigint }>>`
      SELECT "targetLanguage", COUNT(*) as count
      FROM "MessageTranslation"
      GROUP BY "targetLanguage"
      ORDER BY count DESC
    `;

    translationsByLanguage.forEach(item => {
      log('cyan', `   ${item.targetLanguage}: ${item.count} traduction(s)`);
    });

    // Messages sans traduction
    log('blue', '\n⚠️  MESSAGES SANS TRADUCTION');
    
    const messagesWithoutTranslation = await prisma.message.findMany({
      where: {
        translations: {
          none: {}
        }
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        createdAt: true,
      }
    });

    if (messagesWithoutTranslation.length === 0) {
      log('green', '   ✅ Tous les messages ont des traductions');
    } else {
      messagesWithoutTranslation.forEach(message => {
        log('yellow', `   ⚠️  ${message.id.substring(0, 8)}... (${message.originalLanguage}) - "${message.content.substring(0, 40)}..."`);
      });
    }

    log('blue', '\n');

  } catch (error) {
    log('red', `❌ Erreur durant l'affichage des stats: ${error}`);
    throw error;
  }
}

/**
 * Point d'entrée principal
 */
async function main() {
  const command = process.argv[2];
  const conversationId = process.argv[3];

  try {
    switch (command) {
      case 'analyze':
        if (!conversationId) {
          log('red', '❌ ID de conversation requis');
          log('yellow', '\nUsage: ts-node diagnostic-helper.ts analyze <conversationId>');
          process.exit(1);
        }
        await analyzeConversation(conversationId);
        break;

      case 'stats':
        await displayGlobalStats();
        break;

      default:
        log('blue', '🔍 OUTIL DE DIAGNOSTIC MEESHY\n');
        log('cyan', 'Commandes disponibles:');
        log('cyan', '  analyze <conversationId>  - Analyse détaillée d\'une conversation');
        log('cyan', '  stats                     - Statistiques globales du système\n');
        log('cyan', 'Exemples:');
        log('cyan', '  ts-node diagnostic-helper.ts analyze meeshy');
        log('cyan', '  ts-node diagnostic-helper.ts stats\n');
        break;
    }
  } catch (error) {
    log('red', `❌ Erreur: ${error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { analyzeConversation, displayGlobalStats };

