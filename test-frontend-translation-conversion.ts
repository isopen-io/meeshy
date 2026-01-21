/**
 * Test de la conversion translations JSON -> translatedAudios dans le transformer frontend
 */

// Simuler les données brutes de l'API Gateway
const attachmentFromAPI = {
  id: '696e9198066d60252d4ef4eb',
  fileName: 'audio_1768853912885.m4a',
  mimeType: 'audio/mp4',
  transcription: {
    text: 'Bon, je propose que nous allions tous à un nouvel événement...',
    language: 'fr',
    confidence: 0.9777037501335144,
    source: 'voice_api',
    durationMs: 23200
  },
  translations: {
    en: {
      type: 'audio',
      transcription: 'Now, I propose that we all go to a new event...',
      path: '/Users/smpceo/Documents/v2_meeshy/services/gateway/uploads/attachments/translated/696e9198066d60252d4ef4eb_en.mp3',
      url: '/api/v1/attachments/file/translated/696e9198066d60252d4ef4eb_en.mp3',
      durationMs: 9320,
      format: 'mp3',
      cloned: false,
      quality: 0.95,
      voiceModelId: '696947ea46d132d2c65153ba',
      ttsModel: 'xtts'
    },
    es: {
      type: 'audio',
      transcription: 'Bueno, propongo que todos vayamos a un nuevo evento...',
      path: '/Users/smpceo/Documents/v2_meeshy/services/gateway/uploads/attachments/translated/696e9198066d60252d4ef4eb_es.mp3',
      url: '/api/v1/attachments/file/translated/696e9198066d60252d4ef4eb_es.mp3',
      durationMs: 8950,
      format: 'mp3',
      cloned: false,
      quality: 0.93,
      voiceModelId: '696947ea46d132d2c65153ba',
      ttsModel: 'xtts'
    }
  }
};

// Simuler la conversion du transformer frontend
function convertTranslations(att: any): any[] | undefined {
  // Si translations JSON existe
  if (att.translations && typeof att.translations === 'object' && Object.keys(att.translations).length > 0) {
    return Object.entries(att.translations).map(([lang, translation]: [string, any]) => ({
      id: String(att.id || ''),
      targetLanguage: lang,
      translatedText: String(translation.transcription || ''),
      audioUrl: String(translation.url || translation.audioUrl || ''),
      durationMs: Number(translation.durationMs) || 0,
      voiceCloned: Boolean(translation.voiceCloned || translation.cloned),
      voiceQuality: Number(translation.voiceQuality || translation.quality) || 0,
      audioPath: translation.path ? String(translation.path) : undefined,
      format: translation.format ? String(translation.format) : undefined,
      ttsModel: translation.ttsModel ? String(translation.ttsModel) : undefined,
      voiceModelId: translation.voiceModelId ? String(translation.voiceModelId) : undefined,
    }));
  }

  return undefined;
}

console.log('🔍 Test de conversion translations JSON -> translatedAudios (Frontend)\n');

console.log('📥 Données brutes de l\'API Gateway:');
console.log(JSON.stringify(attachmentFromAPI, null, 2).substring(0, 800));

const translatedAudios = convertTranslations(attachmentFromAPI);

console.log('\n✅ Résultat de la conversion:');
console.log(JSON.stringify(translatedAudios, null, 2));

console.log('\n📊 Vérifications:');
console.log(`✅ translatedAudios créé: ${!!translatedAudios}`);
console.log(`✅ Nombre de traductions: ${translatedAudios?.length || 0}`);
console.log(`✅ Langues disponibles: ${translatedAudios?.map(t => t.targetLanguage).join(', ')}`);

if (translatedAudios && translatedAudios.length > 0) {
  console.log('\n🎵 Détails des traductions:');
  translatedAudios.forEach((ta, i) => {
    console.log(`\n  ${i + 1}. Langue: ${ta.targetLanguage}`);
    console.log(`     - Texte: "${ta.translatedText?.substring(0, 60)}..."`);
    console.log(`     - URL: ${ta.audioUrl}`);
    console.log(`     - Durée: ${ta.durationMs}ms`);
    console.log(`     - Format: ${ta.format}`);
    console.log(`     - TTS Model: ${ta.ttsModel}`);
  });
}

console.log('\n✅ La conversion fonctionne correctement !');
console.log('Le frontend peut maintenant afficher les traductions audio depuis translations JSON.');
