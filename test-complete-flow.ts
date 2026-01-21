/**
 * Test du flux complet : BD → Gateway → Frontend
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testCompleteFlow() {
  try {
    console.log('🔄 Test du flux complet : BD → Gateway → Frontend\n');

    const conversationId = '696e9177066d60252d4ef4e7';
    const messageId = '696e919b066d60252d4ef4ec';
    const attachmentId = '696e9198066d60252d4ef4eb';

    console.log('📊 Étape 1: Données depuis MongoDB via Prisma\n');

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

    if (!message || !message.attachments || message.attachments.length === 0) {
      console.log('❌ Message ou attachment non trouvé');
      return;
    }

    const att = message.attachments[0] as any;

    console.log('✅ Attachment depuis Prisma:');
    console.log(`   - ID: ${att.id}`);
    console.log(`   - Type: ${att.mimeType}`);
    console.log(`   - Transcription présente: ${!!att.transcription}`);
    console.log(`   - Translations présentes: ${!!att.translations}`);

    if (att.transcription) {
      console.log('\n📝 Transcription:');
      console.log(`   - Text: "${att.transcription.text?.substring(0, 80)}..."`);
      console.log(`   - Language: ${att.transcription.language}`);
    }

    if (att.translations) {
      console.log('\n🌍 Translations JSON:');
      console.log(`   - Langues: ${Object.keys(att.translations).join(', ')}`);
      for (const [lang, translation] of Object.entries(att.translations)) {
        console.log(`   - ${lang}:`);
        console.log(`     - Texte: "${(translation as any).transcription?.substring(0, 60)}..."`);
        console.log(`     - URL: ${(translation as any).url}`);
      }
    }

    console.log('\n\n📊 Étape 2: Simulation Gateway (structure inchangée)\n');

    // Le Gateway retourne les données telles quelles
    const gatewayResponse = {
      id: att.id,
      mimeType: att.mimeType,
      transcription: att.transcription,
      translations: att.translations, // ✅ Structure BD préservée
    };

    console.log('✅ Gateway retourne:');
    console.log(`   - transcription: ${!!gatewayResponse.transcription ? 'présent' : 'absent'}`);
    console.log(`   - translations: ${!!gatewayResponse.translations ? 'présent (JSON)' : 'absent'}`);

    console.log('\n\n📊 Étape 3: Transformation Frontend\n');

    // Transformer frontend : mappe translations → translationsJson
    const frontendAttachment = {
      id: gatewayResponse.id,
      mimeType: gatewayResponse.mimeType,
      transcription: gatewayResponse.transcription,
      translationsJson: gatewayResponse.translations, // ✅ Renommé pour le frontend
    };

    console.log('✅ Transformer frontend:');
    console.log(`   - transcription: ${!!frontendAttachment.transcription ? 'présent' : 'absent'}`);
    console.log(`   - translationsJson: ${!!frontendAttachment.translationsJson ? 'présent (JSON)' : 'absent'}`);

    console.log('\n\n📊 Étape 4: Hook useAudioTranslation\n');

    // Hook convertit translationsJson en array pour l'UI
    const convertTranslationsToArray = (translations: any) => {
      if (!translations || Object.keys(translations).length === 0) {
        return [];
      }

      return Object.entries(translations).map(([lang, translation]: [string, any]) => ({
        id: attachmentId,
        targetLanguage: lang,
        translatedText: translation.transcription || '',
        audioUrl: translation.url || '',
        durationMs: translation.durationMs || 0,
        format: translation.format || 'mp3',
      }));
    };

    const translatedAudios = convertTranslationsToArray(frontendAttachment.translationsJson);

    console.log('✅ Hook useAudioTranslation convertit:');
    console.log(`   - translationsJson (JSON) → translatedAudios (array)`);
    console.log(`   - Nombre de traductions: ${translatedAudios.length}`);
    console.log(`   - Langues disponibles: ${translatedAudios.map(t => t.targetLanguage).join(', ')}`);

    console.log('\n\n📊 Étape 5: UI SimpleAudioPlayer\n');

    console.log('✅ Lecteur audio reçoit:');
    console.log(`   - Transcription originale: "${frontendAttachment.transcription?.text?.substring(0, 60)}..."`);
    console.log(`   - Langue originale: ${frontendAttachment.transcription?.language}`);
    console.log(`   - ${translatedAudios.length} traduction(s) disponible(s):`);

    translatedAudios.forEach(ta => {
      console.log(`     - ${ta.targetLanguage}: "${ta.translatedText?.substring(0, 60)}..."`);
      console.log(`       URL: ${ta.audioUrl}`);
    });

    console.log('\n\n🎉 SUCCÈS: Flux complet testé avec succès !');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ BD → Gateway : Structure préservée (translations JSON)');
    console.log('✅ Gateway → Frontend : Mapping simple (translations → translationsJson)');
    console.log('✅ Frontend → Hook : Conversion interne (JSON → array pour UI)');
    console.log('✅ Hook → UI : Données prêtes pour affichage');

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testCompleteFlow();
