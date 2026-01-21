/**
 * Test de l'API pour vérifier si les segments sont retournés
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testApiSegments() {
  try {
    console.log('🔍 Test API pour message avec segments\n');

    // Message qui a des segments en BD
    const messageId = '696e4ff3acd8e6ae9461ad7d';
    const conversationId = '696e4fb1acd8e6ae9461ad73';

    // Query exacte du Gateway
    const messageSelect = {
      id: true,
      content: true,
      attachments: {
        select: {
          id: true,
          mimeType: true,
          transcription: true,  // ✅ JSON scalaire - doit inclure segments
        }
      }
    };

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: messageSelect as any
    });

    if (!message || !message.attachments || message.attachments.length === 0) {
      console.log('❌ Message ou attachment non trouvé');
      return;
    }

    const att = message.attachments[0] as any;

    console.log('📄 Message depuis Prisma:');
    console.log(`   - ID: ${att.id}`);
    console.log(`   - Type: ${att.mimeType}`);

    if (att.transcription) {
      console.log('\n📝 Transcription:');
      console.log(`   - Text: "${att.transcription.text?.substring(0, 80)}..."`);
      console.log(`   - Language: ${att.transcription.language}`);
      console.log(`   - Segments présents: ${att.transcription.segments ? 'OUI ✅' : 'NON ❌'}`);
      console.log(`   - Nombre de segments: ${att.transcription.segments?.length || 0}`);

      if (att.transcription.segments && att.transcription.segments.length > 0) {
        console.log('\n   🔹 Premier segment:');
        const seg = att.transcription.segments[0];
        console.log(`      - Text: "${seg.text}"`);
        console.log(`      - Start: ${seg.startMs}ms`);
        console.log(`      - End: ${seg.endMs}ms`);
        console.log(`      - Confidence: ${seg.confidence}`);

        console.log('\n   🔹 Dernier segment:');
        const lastSeg = att.transcription.segments[att.transcription.segments.length - 1];
        console.log(`      - Text: "${lastSeg.text}"`);
        console.log(`      - Start: ${lastSeg.startMs}ms`);
        console.log(`      - End: ${lastSeg.endMs}ms`);
      }
    }

    // Simuler la sérialisation JSON comme le Gateway
    console.log('\n\n🔄 Test sérialisation JSON (comme Gateway):');
    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized);

    const transcriptionAfter = deserialized?.attachments?.[0]?.transcription;
    if (transcriptionAfter) {
      console.log(`✅ Transcription après JSON.stringify/parse:`);
      console.log(`   - Segments présents: ${transcriptionAfter.segments ? 'OUI ✅' : 'NON ❌'}`);
      console.log(`   - Nombre: ${transcriptionAfter.segments?.length || 0}`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testApiSegments();
