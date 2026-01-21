// Script pour vérifier la structure des segments en base de données

// Simulation de ce qui est en BD selon l'utilisateur
const attachmentFromDB = {
  transcription: {
    text: "Okay, you will reach the region of no man's land before entering to the west coast...",
    language: "en",
    confidence: 0.6808918714523315,
    source: "whisper",
    segments: [
      {
        text: "Okay,",
        confidence: 0.3888068497180939
      },
      {
        text: "you will reach",
        confidence: 0.9892997011846425
      },
      {
        text: "the region",
        confidence: 0.9834901248967207
      }
    ],
    durationMs: 34180
  }
};

console.log('=== STRUCTURE DES SEGMENTS EN BASE ===');
console.log('Nombre de segments:', attachmentFromDB.transcription.segments.length);
console.log('\n=== PREMIER SEGMENT ===');
console.log(JSON.stringify(attachmentFromDB.transcription.segments[0], null, 2));
console.log('\n=== CHAMPS MANQUANTS ===');
console.log('startMs présent?', 'startMs' in attachmentFromDB.transcription.segments[0]);
console.log('endMs présent?', 'endMs' in attachmentFromDB.transcription.segments[0]);
console.log('\n❌ Les segments en base n\'ont QUE text et confidence');
console.log('❌ Il manque startMs et endMs pour la synchronisation audio !');
