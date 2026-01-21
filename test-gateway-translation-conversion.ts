/**
 * Test de la conversion translations JSON -> translatedAudios array
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testTranslationConversion() {
  try {
    console.log('🔍 Test de conversion translations -> translatedAudios\n');

    const conversationId = '696e9177066d60252d4ef4e7';
    const messageId = '696e919b066d60252d4ef4ec';

    // Query exacte du Gateway
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
            transcription: true,
            translations: true,
          }
        }
      }
    });

    if (!message) {
      console.log('❌ Message non trouvé');
      return;
    }

    console.log('📄 Message original depuis Prisma:');
    console.log(JSON.stringify(message, null, 2).substring(0, 1000));

    // Simuler la conversion comme dans le Gateway
    const processedAttachments = message.attachments?.map((att: any) => {
      if (att.translations && att.mimeType?.startsWith('audio/')) {
        console.log('\n🔄 Conversion pour attachment:', att.id);
        console.log('   - translations type:', typeof att.translations);
        console.log('   - translations keys:', Object.keys(att.translations));

        const translatedAudios = Object.entries(att.translations).map(([lang, translation]: [string, any]) => {
          console.log(`   - Langue: ${lang}`);
          console.log(`     - transcription: ${translation.transcription?.substring(0, 50)}`);
          console.log(`     - url: ${translation.url}`);

          return {
            id: att.id,
            targetLanguage: lang,
            translatedText: translation.transcription || '',
            audioUrl: translation.url || translation.audioUrl || '',
            durationMs: translation.durationMs || 0,
            voiceCloned: translation.voiceCloned || false,
            voiceQuality: translation.voiceQuality || 0,
            format: translation.format || 'mp3',
            ttsModel: translation.ttsModel || '',
          };
        });

        console.log('\n✅ translatedAudios créé:', translatedAudios.length, 'traductions');

        return {
          ...att,
          translatedAudios,
        };
      }

      return att;
    }) || [];

    console.log('\n📋 Message après conversion:');
    const result = {
      ...message,
      attachments: processedAttachments
    };

    console.log(JSON.stringify(result, null, 2));

    console.log('\n📊 Vérifications:');
    const attachment = result.attachments?.[0];
    if (attachment) {
      console.log(`✅ Transcription présente: ${!!attachment.transcription}`);
      console.log(`✅ Translations JSON présente: ${!!attachment.translations}`);
      console.log(`✅ TranslatedAudios array présente: ${!!(attachment as any).translatedAudios}`);
      console.log(`✅ Nombre de traductions: ${(attachment as any).translatedAudios?.length || 0}`);

      if ((attachment as any).translatedAudios?.length > 0) {
        const firstTranslation = (attachment as any).translatedAudios[0];
        console.log(`\n🎵 Première traduction:` );
        console.log(`   - Langue: ${firstTranslation.targetLanguage}`);
        console.log(`   - Texte traduit: ${firstTranslation.translatedText?.substring(0, 80)}...`);
        console.log(`   - Audio URL: ${firstTranslation.audioUrl}`);
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testTranslationConversion();
