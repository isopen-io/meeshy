/**
 * Script de migration : MessageAudioTranscription et MessageTranslatedAudio → MessageAttachment JSON
 *
 * Ce script migre les données depuis les anciennes collections séparées
 * vers les champs JSON intégrés dans MessageAttachment.
 *
 * Changements :
 * - MessageAudioTranscription → MessageAttachment.transcription (Json)
 * - MessageTranslatedAudio → MessageAttachment.translations (Json)
 *
 * Usage:
 *   bun run services/gateway/scripts/migrate-audio-to-json.ts [--dry-run]
 */

import { PrismaClient } from '@meeshy/shared/database';

const prisma = new PrismaClient();

interface TranscriptionData {
  text: string;
  language: string;
  confidence: number;
  source: string;
  model?: string;
  segments?: any;
  speakerCount?: number;
  primarySpeakerId?: string;
  durationMs: number;
  // Métadonnées avancées
  speakerAnalysis?: any;
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string;
  voiceQualityAnalysis?: any;
}

interface TranslationData {
  type: 'audio' | 'video' | 'text';
  transcription: string;
  path?: string;
  url?: string;
  durationMs?: number;
  format?: string;
  cloned?: boolean;
  quality?: number;
  voiceModelId?: string;
  ttsModel?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

async function migrateAudioData(dryRun: boolean = false) {
  console.log('\n🚀 Migration : Audio Transcription & Translations → JSON\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (aucune modification)' : '✍️  ÉCRITURE'}\n`);

  try {
    // 1. Récupérer toutes les transcriptions
    console.log('📖 Lecture des transcriptions...');
    const transcriptions = await (prisma as any).messageAudioTranscription.findMany({
      include: {
        attachment: true
      }
    });
    console.log(`   ✓ ${transcriptions.length} transcriptions trouvées\n`);

    // 2. Récupérer toutes les traductions audio
    console.log('📖 Lecture des traductions audio...');
    const translatedAudios = await (prisma as any).messageTranslatedAudio.findMany({
      orderBy: { createdAt: 'asc' }
    });
    console.log(`   ✓ ${translatedAudios.length} traductions trouvées\n`);

    // 3. Grouper les traductions par attachmentId
    const translationsByAttachment = new Map<string, any[]>();
    for (const audio of translatedAudios) {
      if (!translationsByAttachment.has(audio.attachmentId)) {
        translationsByAttachment.set(audio.attachmentId, []);
      }
      translationsByAttachment.get(audio.attachmentId)!.push(audio);
    }

    // 4. Traiter chaque transcription
    console.log('🔄 Migration des données...\n');
    let migratedCount = 0;
    let errorCount = 0;

    for (const trans of transcriptions) {
      try {
        const attachmentId = trans.attachmentId;

        // Construire la structure transcription
        const transcriptionData: TranscriptionData = {
          text: trans.transcribedText,
          language: trans.language,
          confidence: trans.confidence,
          source: trans.source,
          model: trans.model || undefined,
          segments: trans.segments || undefined,
          speakerCount: trans.speakerCount || undefined,
          primarySpeakerId: trans.primarySpeakerId || undefined,
          durationMs: trans.audioDurationMs,
          speakerAnalysis: trans.speakerAnalysis || undefined,
          senderVoiceIdentified: trans.senderVoiceIdentified || undefined,
          senderSpeakerId: trans.senderSpeakerId || undefined,
          voiceQualityAnalysis: trans.voiceQualityAnalysis || undefined
        };

        // Construire la structure translations
        const translationsData: Record<string, TranslationData> = {};
        const attachmentTranslations = translationsByAttachment.get(attachmentId) || [];

        for (const audio of attachmentTranslations) {
          translationsData[audio.targetLanguage] = {
            type: 'audio',
            transcription: audio.translatedText,
            path: audio.audioPath,
            url: audio.audioUrl,
            durationMs: audio.durationMs,
            format: audio.format,
            cloned: audio.voiceCloned,
            quality: audio.voiceQuality,
            voiceModelId: audio.voiceModelId || undefined,
            ttsModel: audio.ttsModel,
            createdAt: audio.createdAt,
            updatedAt: undefined, // Pas d'historique d'update
            deletedAt: undefined
          };
        }

        if (!dryRun) {
          // Mettre à jour l'attachment
          await prisma.messageAttachment.update({
            where: { id: attachmentId },
            data: {
              transcription: transcriptionData as any,
              translations: Object.keys(translationsData).length > 0
                ? translationsData as any
                : undefined
            }
          });
        }

        migratedCount++;
        console.log(`   ✓ ${migratedCount}/${transcriptions.length} - Attachment ${attachmentId} migré (${Object.keys(translationsData).length} traductions)`);

      } catch (error: any) {
        errorCount++;
        console.error(`   ❌ Erreur sur attachment ${trans.attachmentId}:`, error.message);
      }
    }

    console.log(`\n✅ Migration terminée :`);
    console.log(`   - ${migratedCount} attachments migrés`);
    console.log(`   - ${errorCount} erreurs`);

    if (!dryRun) {
      // 5. Supprimer les anciennes données
      console.log('\n🗑️  Suppression des anciennes collections...');

      const deletedTranslations = await (prisma as any).messageTranslatedAudio.deleteMany({});
      console.log(`   ✓ ${deletedTranslations.count} traductions supprimées`);

      const deletedTranscriptions = await (prisma as any).messageAudioTranscription.deleteMany({});
      console.log(`   ✓ ${deletedTranscriptions.count} transcriptions supprimées`);

      console.log('\n✅ Anciennes collections vidées !');
    } else {
      console.log('\n🔍 DRY RUN : Aucune donnée supprimée');
    }

    console.log('\n🎉 Migration réussie !\n');

  } catch (error) {
    console.error('\n❌ Erreur fatale :', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migrateAudioData(dryRun)
  .then(() => {
    console.log('✓ Script terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Script échoué:', error);
    process.exit(1);
  });
