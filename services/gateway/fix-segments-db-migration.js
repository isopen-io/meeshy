/**
 * Script de Migration: Nettoyer les segments de transcription
 *
 * Problème:
 * - voiceSimilarityScore: false (booléen) au lieu de null ou number
 * - Fastify rejette les segments avec des types incorrects
 *
 * Solution:
 * - Convertir false → null
 * - Convertir true → null
 * - Garder les nombres valides
 */

const { PrismaClient } = require('@meeshy/shared/prisma/client');

const prisma = new PrismaClient();

async function fixSegments() {
  console.log('🔍 Recherche des attachments avec transcription...');

  // Récupérer tous les attachments avec transcription
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

  console.log(`📊 Trouvé ${attachments.length} attachment(s) avec transcription`);

  let updatedCount = 0;
  let segmentsFixedCount = 0;

  for (const attachment of attachments) {
    const transcription = attachment.transcription;

    // Vérifier si des segments existent
    if (!transcription.segments || !Array.isArray(transcription.segments)) {
      continue;
    }

    let needsUpdate = false;
    const fixedSegments = transcription.segments.map((seg) => {
      const fixed = { ...seg };

      // Fix 1: Convertir voiceSimilarityScore boolean → null
      if (typeof seg.voiceSimilarityScore === 'boolean') {
        console.log(`  🔧 Segment "${seg.text.substring(0, 20)}" - voiceSimilarityScore: ${seg.voiceSimilarityScore} → null`);
        fixed.voiceSimilarityScore = null;
        needsUpdate = true;
        segmentsFixedCount++;
      }
      // Vérifier que c'est bien un nombre ou null
      else if (seg.voiceSimilarityScore !== null && typeof seg.voiceSimilarityScore !== 'number') {
        console.log(`  ⚠️ Segment "${seg.text.substring(0, 20)}" - voiceSimilarityScore type invalide: ${typeof seg.voiceSimilarityScore} → null`);
        fixed.voiceSimilarityScore = null;
        needsUpdate = true;
        segmentsFixedCount++;
      }

      return fixed;
    });

    if (needsUpdate) {
      console.log(`\n💾 Mise à jour attachment ${attachment.id} (${fixedSegments.length} segments)`);

      // Mettre à jour la transcription avec les segments corrigés
      await prisma.messageAttachment.update({
        where: { id: attachment.id },
        data: {
          transcription: {
            ...transcription,
            segments: fixedSegments
          }
        }
      });

      updatedCount++;
    }
  }

  console.log('\n✅ Migration terminée!');
  console.log(`   - Attachments mis à jour: ${updatedCount}`);
  console.log(`   - Segments corrigés: ${segmentsFixedCount}`);
}

// Exécution
fixSegments()
  .then(() => {
    console.log('\n🎉 Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
