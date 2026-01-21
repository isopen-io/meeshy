/**
 * Test de l'API pour la nouvelle conversation
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testApiNewConversation() {
  try {
    console.log('🔍 Test API pour conversation 696e9177066d60252d4ef4e7\n');

    const conversationId = '696e9177066d60252d4ef4e7';
    const messageId = '696e919b066d60252d4ef4ec';

    // Query exacte du Gateway
    const messageSelect = {
      id: true,
      content: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          transcription: true,
          translations: true,
        }
      }
    };

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversationId,
        isDeleted: false
      },
      select: messageSelect as any,
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`✅ Query réussie: ${messages.length} messages trouvés\n`);

    // Chercher le message avec transcription
    const targetMessage = messages.find((m: any) => m.id === messageId);

    if (targetMessage) {
      console.log(`📄 Message ${messageId} trouvé:\n`);

      const message = targetMessage as any;
      console.log(`Content: "${message.content || '(audio only)'}"`);
      console.log(`Attachments: ${message.attachments?.length || 0}`);

      if (message.attachments && message.attachments.length > 0) {
        console.log('\n📎 Détails des attachments:');
        message.attachments.forEach((att: any, i: number) => {
          console.log(`\n  Attachment ${i + 1}:`);
          console.log(`    - ID: ${att.id}`);
          console.log(`    - Fichier: ${att.fileName}`);
          console.log(`    - Type: ${att.mimeType}`);
          console.log(`    - Transcription présente: ${att.transcription ? 'OUI ✅' : 'NON ❌'}`);
          console.log(`    - Transcription type: ${typeof att.transcription}`);

          if (att.transcription) {
            console.log(`\n    📝 Transcription:`);
            console.log(`       - Text: ${(att.transcription as any).text?.substring(0, 100)}...`);
            console.log(`       - Language: ${(att.transcription as any).language}`);
            console.log(`       - Confidence: ${(att.transcription as any).confidence}`);
            console.log(`       - Source: ${(att.transcription as any).source}`);
          } else {
            console.log(`    ❌ Transcription value: ${att.transcription}`);
          }

          console.log(`\n    🌍 Translations présentes: ${att.translations ? 'OUI ✅' : 'NON ❌'}`);
          if (att.translations) {
            console.log(`       - Type: ${typeof att.translations}`);
            console.log(`       - Langues: ${Object.keys(att.translations)}`);
          }
        });
      }

      // Serialiser en JSON comme l'API
      console.log('\n\n🔄 Test sérialisation JSON (comme l\'API):');
      const serialized = JSON.stringify(targetMessage);
      const deserialized = JSON.parse(serialized);

      const hasTranscriptionAfterSerialization = deserialized?.attachments?.[0]?.transcription;
      console.log(`Transcription après sérialisation: ${hasTranscriptionAfterSerialization ? 'OUI ✅' : 'NON ❌'}`);

      if (hasTranscriptionAfterSerialization) {
        console.log(`Text: ${hasTranscriptionAfterSerialization.text?.substring(0, 80)}...`);
      }

    } else {
      console.log(`❌ Message ${messageId} non trouvé\n`);
      console.log('Messages trouvés:');
      messages.forEach((msg: any, i: number) => {
        console.log(`  ${i + 1}. ${msg.id} - ${msg.content || '(audio only)'}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testApiNewConversation();
