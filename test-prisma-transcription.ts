/**
 * Test pour voir ce que Prisma retourne réellement
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testPrismaTranscription() {
  try {
    console.log('🔍 Recherche d\'un message avec attachment audio + transcription...\n');

    // ID d'un message qu'on sait avoir une transcription
    const messageId = '696e4ff3acd8e6ae9461ad7d';

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        content: true,
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            transcription: true,  // ← Le champ qui nous intéresse
            translations: true,   // ← Et celui-ci aussi
          }
        }
      }
    });

    console.log('📄 Résultat Prisma:');
    console.log(JSON.stringify(message, null, 2));

    console.log('\n📊 Détails de l\'attachment:');
    if (message?.attachments && message.attachments.length > 0) {
      const att = message.attachments[0];
      console.log(`- ID: ${att.id}`);
      console.log(`- Fichier: ${att.fileName}`);
      console.log(`- Transcription type: ${typeof att.transcription}`);
      console.log(`- Transcription value:`, att.transcription);
      console.log(`- Translations type: ${typeof att.translations}`);
      console.log(`- Translations value:`, att.translations);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testPrismaTranscription();
