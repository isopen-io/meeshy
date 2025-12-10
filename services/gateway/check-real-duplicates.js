// Script pour vérifier les VRAIS doublons (documents différents avec même messageId + targetLanguage)
const { PrismaClient } = require('./shared/prisma/client');

const prisma = new PrismaClient();

async function checkRealDuplicates() {
  try {
    
    // Utiliser une requête brute pour être sûr
    const result = await prisma.$queryRaw`
      SELECT 
        "messageId",
        "targetLanguage",
        COUNT(*) as count,
        array_agg("_id" ORDER BY "createdAt" DESC) as ids,
        array_agg("createdAt" ORDER BY "createdAt" DESC) as dates
      FROM "MessageTranslation"
      GROUP BY "messageId", "targetLanguage"
      HAVING COUNT(*) > 1
      LIMIT 20
    `;
    
    
    if (result.length > 0) {
      result.forEach((row, idx) => {
      });
    } else {
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    
    // Méthode alternative avec aggregation
    const allTranslations = await prisma.messageTranslation.findMany({
      select: {
        id: true,
        messageId: true,
        targetLanguage: true,
        createdAt: true
      }
    });
    
    // Créer un Set d'IDs uniques
    const uniqueIds = new Set();
    const duplicateIds = new Set();
    
    allTranslations.forEach(t => {
      if (uniqueIds.has(t.id)) {
        duplicateIds.add(t.id);
      }
      uniqueIds.add(t.id);
    });
    
    
    if (duplicateIds.size > 0) {
    } else {
    }
    
    // Maintenant, vérifier les vrais doublons (même messageId + targetLanguage)
    const groups = new Map();
    
    allTranslations.forEach(t => {
      const key = `${t.messageId}_${t.targetLanguage}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(t);
    });
    
    const duplicateGroups = Array.from(groups.entries())
      .filter(([key, translations]) => translations.length > 1);
    
    
    if (duplicateGroups.length > 0) {
      duplicateGroups.slice(0, 10).forEach(([key, translations], idx) => {
        const [messageId, targetLanguage] = key.split('_');
        translations.forEach((t, tIdx) => {
        });
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkRealDuplicates();

