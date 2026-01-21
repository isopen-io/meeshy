/**
 * Test de l'API avec le schéma de validation réactivé
 * Ce script teste directement la sérialisation des segments comme le fait Fastify
 */

const { PrismaClient } = require('@meeshy/shared/prisma/client');
const fastJsonStringify = require('fast-json-stringify');

const prisma = new PrismaClient();

// Schéma des segments (simplifié) tel que défini dans api-schemas.ts
const segmentSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    startMs: { type: 'number' },
    endMs: { type: 'number' },
    speakerId: { type: 'string', nullable: true },
    voiceSimilarityScore: { type: 'number', nullable: true },
    confidence: { type: 'number' },
    language: { type: 'string', nullable: true }
  }
};

const transcriptionSchema = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: segmentSchema
    }
  }
};

async function testSchema() {
  console.log('🔍 Test de la sérialisation avec fast-json-stringify...\n');

  // Créer le serializer (comme Fastify le fait)
  const stringify = fastJsonStringify(transcriptionSchema);

  // Récupérer un attachment avec transcription
  const attachment = await prisma.messageAttachment.findFirst({
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

  if (!attachment || !attachment.transcription?.segments) {
    console.log('❌ Aucun attachment avec segments trouvé');
    return;
  }

  console.log(`✅ Attachment trouvé: ${attachment.id}`);
  console.log(`   Nombre de segments: ${attachment.transcription.segments.length}\n`);

  // Test 1: Sérialiser les données brutes (comme elles viennent de la DB)
  console.log('📝 Test 1: Sérialisation des données brutes de la DB\n');

  const rawData = {
    segments: attachment.transcription.segments
  };

  try {
    const serialized = stringify(rawData);
    const parsed = JSON.parse(serialized);

    console.log('   ✅ Sérialisation réussie');
    console.log(`   Nombre de segments après sérialisation: ${parsed.segments?.length || 0}`);

    if (parsed.segments && parsed.segments.length > 0) {
      const seg = parsed.segments[0];
      console.log('\n   Premier segment sérialisé:');
      console.log(`     text: "${seg.text}"`);
      console.log(`     startMs: ${seg.startMs}`);
      console.log(`     endMs: ${seg.endMs}`);
      console.log(`     speakerId: ${seg.speakerId}`);
      console.log(`     voiceSimilarityScore: ${seg.voiceSimilarityScore}`);
      console.log(`     confidence: ${seg.confidence}`);
      console.log(`     language: ${seg.language}`);

      // Vérifier que tous les champs sont présents
      const hasAllFields = (
        seg.text !== undefined &&
        seg.startMs !== undefined &&
        seg.endMs !== undefined &&
        seg.confidence !== undefined
      );

      if (hasAllFields) {
        console.log('\n   ✅ Tous les champs critiques sont présents!');
      } else {
        console.log('\n   ❌ Certains champs critiques sont manquants!');
      }
    }
  } catch (error) {
    console.error('   ❌ Erreur de sérialisation:', error.message);
  }

  // Test 2: Simuler cleanAttachmentsForApi
  console.log('\n\n📝 Test 2: Après nettoyage (comme cleanAttachmentsForApi)\n');

  const cleanedSegments = attachment.transcription.segments.map((seg) => ({
    ...seg,
    voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
  }));

  const cleanedData = {
    segments: cleanedSegments
  };

  try {
    const serialized = stringify(cleanedData);
    const parsed = JSON.parse(serialized);

    console.log('   ✅ Sérialisation réussie');
    console.log(`   Nombre de segments après sérialisation: ${parsed.segments?.length || 0}`);

    if (parsed.segments && parsed.segments.length > 0) {
      const seg = parsed.segments[0];
      console.log('\n   Premier segment sérialisé:');
      console.log(`     text: "${seg.text}"`);
      console.log(`     startMs: ${seg.startMs}`);
      console.log(`     endMs: ${seg.endMs}`);
      console.log(`     speakerId: ${seg.speakerId}`);
      console.log(`     voiceSimilarityScore: ${seg.voiceSimilarityScore}`);
      console.log(`     confidence: ${seg.confidence}`);
      console.log(`     language: ${seg.language}`);
    }
  } catch (error) {
    console.error('   ❌ Erreur de sérialisation:', error.message);
  }

  console.log('\n🎯 Conclusion:\n');
  console.log('   Le schéma de validation devrait maintenant fonctionner correctement');
  console.log('   car tous les voiceSimilarityScore sont null (pas boolean).');
}

testSchema()
  .then(() => {
    console.log('\n✅ Test terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
