// Script pour nettoyer les doublons en utilisant UNIQUEMENT Prisma
const { PrismaClient } = require('./shared/prisma/client');

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  try {
    
    // Étape 1: Trouver tous les messages qui ont des doublons
    
    const allTranslations = await prisma.messageTranslation.findMany({
      orderBy: [
        { messageId: 'asc' },
        { targetLanguage: 'asc' },
        { createdAt: 'desc' } // Plus récent en premier
      ]
    });
    
    
    // Grouper par messageId + targetLanguage
    const groups = new Map();
    
    for (const translation of allTranslations) {
      const key = `${translation.messageId}_${translation.targetLanguage}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key).push(translation);
    }
    
    // Trouver les groupes avec doublons
    const duplicateGroups = Array.from(groups.entries())
      .filter(([key, translations]) => translations.length > 1);
    
    
    if (duplicateGroups.length === 0) {
      return;
    }
    
    // Étape 2: Supprimer les doublons (garder le plus récent)
    
    let deletedCount = 0;
    let processedCount = 0;
    
    for (const [key, translations] of duplicateGroups) {
      const [messageId, targetLanguage] = key.split('_');
      
      // Le premier est le plus récent (trié par createdAt desc)
      const toKeep = translations[0];
      const toDelete = translations.slice(1);
      
      if (processedCount < 5) {
        toDelete.forEach(t => {
        });
      }
      
      // Supprimer les doublons
      for (const t of toDelete) {
        await prisma.messageTranslation.delete({
          where: { id: t.id }
        });
        deletedCount++;
      }
      
      processedCount++;
      
      if (processedCount % 50 === 0) {
      }
    }
    
    
    // Étape 3: Vérification finale
    
    const remainingTranslations = await prisma.messageTranslation.findMany({});
    const remainingGroups = new Map();
    
    for (const translation of remainingTranslations) {
      const key = `${translation.messageId}_${translation.targetLanguage}`;
      
      if (!remainingGroups.has(key)) {
        remainingGroups.set(key, []);
      }
      
      remainingGroups.get(key).push(translation);
    }
    
    const remainingDuplicates = Array.from(remainingGroups.entries())
      .filter(([key, translations]) => translations.length > 1);
    
    
    if (remainingDuplicates.length === 0) {
    } else {
    }
    
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupDuplicates();

