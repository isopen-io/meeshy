const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function verifyMigration() {
  console.log('🔍 Vérification de la migration des segments...\n');

  // Trouver tous les attachments avec transcription
  const attachments = await prisma.messageAttachment.findMany({
    where: {
      transcription: {
        not: null
      }
    },
    select: {
      id: true,
      transcription: true
    }
  });

  console.log(`📊 Total d'attachments avec transcription: ${attachments.length}\n`);

  let totalSegments = 0;
  let segmentsWithBooleanScore = 0;
  let segmentsWithNullScore = 0;
  let segmentsWithNumberScore = 0;
  let segmentsWithAllFields = 0;

  for (const attachment of attachments) {
    if (!attachment.transcription?.segments) continue;

    for (const seg of attachment.transcription.segments) {
      totalSegments++;

      // Vérifier voiceSimilarityScore
      const scoreType = typeof seg.voiceSimilarityScore;
      if (scoreType === 'boolean') {
        segmentsWithBooleanScore++;
        console.log(`❌ PROBLÈME: Segment avec voiceSimilarityScore boolean dans ${attachment.id}`);
        console.log(`   Text: "${seg.text?.substring(0, 30)}"`);
        console.log(`   voiceSimilarityScore: ${seg.voiceSimilarityScore} (${scoreType})\n`);
      } else if (seg.voiceSimilarityScore === null) {
        segmentsWithNullScore++;
      } else if (scoreType === 'number') {
        segmentsWithNumberScore++;
      }

      // Vérifier la présence de tous les champs critiques
      const hasAllFields = (
        seg.text !== undefined &&
        seg.startMs !== undefined &&
        seg.endMs !== undefined &&
        seg.confidence !== undefined
      );

      if (hasAllFields) {
        segmentsWithAllFields++;
      }
    }
  }

  console.log('📈 Statistiques:\n');
  console.log(`   Total segments: ${totalSegments}`);
  console.log(`   Segments avec tous les champs critiques: ${segmentsWithAllFields} (${((segmentsWithAllFields / totalSegments) * 100).toFixed(1)}%)`);
  console.log('\n   voiceSimilarityScore:');
  console.log(`     - null: ${segmentsWithNullScore} (${((segmentsWithNullScore / totalSegments) * 100).toFixed(1)}%)`);
  console.log(`     - number: ${segmentsWithNumberScore} (${((segmentsWithNumberScore / totalSegments) * 100).toFixed(1)}%)`);
  console.log(`     - boolean: ${segmentsWithBooleanScore} (${((segmentsWithBooleanScore / totalSegments) * 100).toFixed(1)}%)`);

  if (segmentsWithBooleanScore === 0) {
    console.log('\n✅ SUCCÈS: Aucun segment avec voiceSimilarityScore boolean trouvé!');
    console.log('   La migration a correctement converti tous les false → null\n');
  } else {
    console.log('\n❌ ÉCHEC: Des segments ont encore des voiceSimilarityScore boolean');
    console.log('   La migration n\'a pas fonctionné complètement\n');
  }

  // Afficher un exemple de segment
  if (attachments.length > 0 && attachments[0].transcription?.segments?.length > 0) {
    const exampleSeg = attachments[0].transcription.segments[0];
    console.log('📝 Exemple de segment (premier segment du premier attachment):');
    console.log(JSON.stringify({
      text: exampleSeg.text,
      startMs: exampleSeg.startMs,
      endMs: exampleSeg.endMs,
      speakerId: exampleSeg.speakerId,
      voiceSimilarityScore: exampleSeg.voiceSimilarityScore,
      confidence: exampleSeg.confidence,
      language: exampleSeg.language
    }, null, 2));
  }
}

verifyMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
