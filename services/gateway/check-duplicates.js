// Script pour vérifier les doublons de traductions
const { PrismaClient } = require('./shared/prisma/client');

const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    
    // Récupérer toutes les traductions
    const allTranslations = await prisma.messageTranslation.findMany({
      orderBy: [
        { messageId: 'asc' },
        { targetLanguage: 'asc' },
        { createdAt: 'desc' }
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
    
    // Trouver les doublons
    const duplicates = Array.from(groups.entries())
      .filter(([key, translations]) => translations.length > 1)
      .slice(0, 20); // Limiter à 20 pour l'affichage
    
    if (duplicates.length === 0) {
      return;
    }
    
    
    let totalDuplicates = 0;
    duplicates.forEach(([key, translations], idx) => {
      const [messageId, targetLanguage] = key.split('_');
      
      translations.forEach((t, tIdx) => {
      });
      
      totalDuplicates += (translations.length - 1);
    });
    
    
    // Compter le total de groupes avec doublons
    const allDuplicateGroups = Array.from(groups.entries())
      .filter(([key, translations]) => translations.length > 1);
    
    
    const totalAllDuplicates = allDuplicateGroups.reduce((sum, [key, translations]) => {
      return sum + (translations.length - 1);
    }, 0);
    
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();

