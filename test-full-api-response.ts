/**
 * Test complet de l'API avec affichage de la réponse exacte
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testFullResponse() {
  try {
    console.log('🔍 Test: Récupérer le message et serializer en JSON comme l\'API\n');

    const conversationId = '696e4fb1acd8e6ae9461ad73';
    const targetMessageId = '696e4ff3acd8e6ae9461ad7d';

    // Query exacte du Gateway
    const message = await prisma.message.findUnique({
      where: { id: targetMessageId },
      select: {
        id: true,
        content: true,
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            transcription: true,
            translations: true,
          }
        }
      }
    });

    console.log('📄 Message depuis Prisma:');
    console.log(JSON.stringify(message, null, 2));

    console.log('\n🔄 Test de sérialisation JSON (comme Fastify):');
    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized);
    console.log(JSON.stringify(deserialized, null, 2));

    console.log('\n📊 Comparaison:');
    const originalTranscription = (message as any)?.attachments?.[0]?.transcription;
    const deserializedTranscription = deserialized?.attachments?.[0]?.transcription;

    console.log(`Original transcription présente: ${originalTranscription ? 'OUI ✅' : 'NON ❌'}`);
    console.log(`Deserialized transcription présente: ${deserializedTranscription ? 'OUI ✅' : 'NON ❌'}`);

    if (originalTranscription) {
      console.log(`Original transcription.text: ${originalTranscription.text?.substring(0, 50)}`);
    }
    if (deserializedTranscription) {
      console.log(`Deserialized transcription.text: ${deserializedTranscription.text?.substring(0, 50)}`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFullResponse();
