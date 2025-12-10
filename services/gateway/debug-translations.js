// Script de debug simple pour voir ce qui se passe vraiment
const { PrismaClient } = require('./shared/prisma/client');

const prisma = new PrismaClient();

async function debugTranslations() {
  try {
    // Prendre un message au hasard qui devrait avoir des traductions
    const messageWithTranslations = await prisma.message.findFirst({
      where: {
        translations: {
          some: {}
        }
      },
      include: {
        translations: true
      }
    });
    
    if (!messageWithTranslations) {
      return;
    }
    
    
    // Afficher chaque traduction
    messageWithTranslations.translations.forEach((t, idx) => {
    });
    
    
    // Créer un Set pour voir les IDs uniques
    const uniqueIds = new Set(messageWithTranslations.translations.map(t => t.id));
    
    if (uniqueIds.size !== messageWithTranslations.translations.length) {
    } else {
    }
    
    // Vérifier les langues
    const languageGroups = new Map();
    messageWithTranslations.translations.forEach(t => {
      if (!languageGroups.has(t.targetLanguage)) {
        languageGroups.set(t.targetLanguage, []);
      }
      languageGroups.get(t.targetLanguage).push(t);
    });
    
    for (const [lang, translations] of languageGroups) {
      if (translations.length > 1) {
        translations.forEach((t, idx) => {
        });
      }
    }
    
    // Maintenant vérifier en base directement
    const directTranslations = await prisma.messageTranslation.findMany({
      where: {
        messageId: messageWithTranslations.id
      },
      orderBy: {
        targetLanguage: 'asc'
      }
    });
    
    
    const directUniqueIds = new Set(directTranslations.map(t => t.id));
    
    if (directUniqueIds.size !== directTranslations.length) {
    } else {
    }
    
    
    if (messageWithTranslations.translations.length !== directTranslations.length) {
    } else {
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugTranslations();

