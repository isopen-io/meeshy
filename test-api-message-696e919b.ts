/**
 * Tester ce que l'API Gateway retourne pour le message 696e919b066d60252d4ef4ec
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testApiMessage() {
  try {
    console.log('🔍 Test API pour message avec traductions\n');

    const messageId = '696e919b066d60252d4ef4ec';
    const conversationId = '696e4fb1acd8e6ae9461ad73';

    // Query exacte du Gateway (celle utilisée par l'API)
    const messageSelect = {
      id: true,
      content: true,
      conversationId: true,
      senderId: true,
      originalLanguage: true,
      messageType: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          thumbnailUrl: true,
          width: true,
          height: true,
          duration: true,
          bitrate: true,
          sampleRate: true,
          codec: true,
          channels: true,
          uploadedBy: true,
          isAnonymous: true,
          createdAt: true,
          transcription: true,   // ✅ JSON scalaire
          translations: true,    // ✅ JSON scalaire
        },
        take: 4
      }
    };

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: messageSelect as any
    });

    if (!message) {
      console.log('❌ Message non trouvé');
      return;
    }

    console.log('📄 Message depuis Prisma:');
    console.log(`   - ID: ${message.id}`);
    console.log(`   - Content: "${message.content.substring(0, 50)}..."`);
    console.log(`   - Attachments: ${message.attachments?.length || 0}`);

    if (!message.attachments || message.attachments.length === 0) {
      console.log('❌ Pas d\'attachments');
      return;
    }

    const att = message.attachments[0] as any;

    console.log('\n📎 Attachment:');
    console.log(`   - ID: ${att.id}`);
    console.log(`   - Type: ${att.mimeType}`);
    console.log(`   - Duration: ${att.duration}ms`);

    console.log('\n📝 Transcription:');
    if (att.transcription) {
      console.log(`   ✅ Présente`);
      console.log(`   - Text: "${att.transcription.text?.substring(0, 60)}..."`);
      console.log(`   - Language: ${att.transcription.language}`);
      console.log(`   - Source: ${att.transcription.source}`);
      console.log(`   - Segments: ${att.transcription.segments?.length || 0}`);
    } else {
      console.log(`   ❌ Absente`);
    }

    console.log('\n🌍 Translations:');
    if (att.translations) {
      console.log(`   ✅ Présentes`);
      console.log(`   - Type: ${typeof att.translations}`);

      if (typeof att.translations === 'object' && att.translations !== null) {
        const langs = Object.keys(att.translations);
        console.log(`   - Langues: ${langs.join(', ')}`);

        for (const lang of langs) {
          const translation = (att.translations as any)[lang];
          console.log(`\n   🔹 ${lang}:`);
          console.log(`      - Type: ${translation.type}`);
          console.log(`      - Transcription: "${translation.transcription?.substring(0, 50)}..."`);
          console.log(`      - URL: ${translation.url || 'N/A'}`);
          console.log(`      - Duration: ${translation.durationMs || 0}ms`);
          console.log(`      - Cloned: ${translation.cloned || false}`);
        }
      }
    } else {
      console.log(`   ❌ Absentes`);
    }

    // Simuler la sérialisation JSON comme le Gateway
    console.log('\n\n🔄 Test sérialisation JSON (comme Gateway):');
    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized);

    const translationsAfter = deserialized?.attachments?.[0]?.translations;
    if (translationsAfter) {
      console.log(`✅ Translations après JSON.stringify/parse:`);
      console.log(`   - Type: ${typeof translationsAfter}`);
      console.log(`   - Langues: ${Object.keys(translationsAfter).join(', ')}`);
      console.log(`   - Structure complète:`);
      console.log(JSON.stringify(translationsAfter, null, 2));
    } else {
      console.log(`❌ Translations perdues après sérialisation`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testApiMessage();
