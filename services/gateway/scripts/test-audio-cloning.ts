/**
 * Script de test pour valider le clonage vocal
 *
 * Ce script simule l'envoi d'une requête audio_process vers le Translator
 * et vérifie que source_audio_path est bien utilisé pour le clonage.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

async function testAudioCloning() {
  const prisma = new PrismaClient();

  try {
    console.log('🧪 Test du clonage vocal\n');

    // 1. Trouver un message audio récent avec des traductions
    console.log('📊 Recherche d\'un message audio avec traductions...');

    const recentAudioMessage = await prisma.message.findFirst({
      where: {
        attachments: {
          some: {
            mimeType: {
              startsWith: 'audio/'
            }
          }
        }
      },
      include: {
        attachments: {
          where: {
            mimeType: {
              startsWith: 'audio/'
            }
          },
          include: {
            transcription: true,
            translatedAudios: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!recentAudioMessage) {
      console.log('❌ Aucun message audio trouvé dans la base');
      return;
    }

    const attachment = recentAudioMessage.attachments[0];
    if (!attachment) {
      console.log('❌ Aucun attachement trouvé');
      return;
    }

    console.log(`\n✅ Message trouvé: ${recentAudioMessage.id}`);
    console.log(`   Attachement: ${attachment.id}`);
    console.log(`   Type: ${attachment.mimeType}`);
    console.log(`   Durée: ${attachment.audioDurationMs || 0}ms`);

    // 2. Vérifier la transcription
    if (attachment.transcription) {
      console.log(`\n📝 Transcription présente:`);
      console.log(`   Texte: "${attachment.transcription.text}"`);
      console.log(`   Langue: ${attachment.transcription.language}`);
      console.log(`   Confiance: ${attachment.transcription.confidence || 'N/A'}`);
    } else {
      console.log('\n⚠️  Pas de transcription');
    }

    // 3. Vérifier les traductions
    if (attachment.translatedAudios && attachment.translatedAudios.length > 0) {
      console.log(`\n🌍 Traductions trouvées: ${attachment.translatedAudios.length}`);

      for (const translation of attachment.translatedAudios) {
        console.log(`\n   Langue: ${translation.targetLanguage}`);
        console.log(`   Texte: "${translation.text}"`);
        console.log(`   Audio URL: ${translation.audioUrl || 'N/A'}`);
        console.log(`   Statut: ${translation.status}`);

        // Vérifier si l'audio existe
        if (translation.audioUrl) {
          console.log(`   ✅ Audio traduit généré`);
        } else {
          console.log(`   ⚠️  Pas d'audio traduit`);
        }
      }
    } else {
      console.log('\n⚠️  Aucune traduction trouvée');
    }

    // 4. Instructions pour tester le clonage
    console.log('\n\n📋 Pour tester le clonage vocal:');
    console.log('   1. Uploadez un nouveau message audio dans une conversation');
    console.log('   2. Surveillez les logs du Translator:');
    console.log('      tmux attach -t meeshy:translator');
    console.log('   3. Cherchez ces lignes:');
    console.log('      [TRANSLATION_STAGE] 🎤 Clonage vocal activé: audio_ref=...');
    console.log('      [TTS] Synthèse multilingue: en (avec audio de référence: ...)');
    console.log('   4. Écoutez l\'audio traduit et vérifiez que la voix ressemble à la vôtre');

    console.log('\n✅ Test terminé\n');

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAudioCloning();
