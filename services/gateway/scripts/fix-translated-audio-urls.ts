/**
 * Script de migration pour corriger les URLs d'audio traduit incorrectes
 *
 * Problème: Certaines traductions ont été stockées avec des URLs du translator
 * comme /outputs/audio/translated/xxx.mp3 au lieu des URLs Gateway correctes
 * comme /api/v1/attachments/file/translated/xxx.mp3
 *
 * Usage:
 *   npx ts-node scripts/fix-translated-audio-urls.ts --dry-run  # Affiche les corrections sans les appliquer
 *   npx ts-node scripts/fix-translated-audio-urls.ts            # Applique les corrections
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AttachmentTranslation {
  type: string;
  transcription: string;
  path?: string;
  url?: string;
  durationMs?: number;
  format?: string;
  cloned?: boolean;
  quality?: number;
  voiceModelId?: string;
  ttsModel?: string;
  segments?: any[];
  createdAt: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | string | null;
}

type AttachmentTranslations = Record<string, AttachmentTranslation>;

async function fixTranslatedAudioUrls(dryRun: boolean = true) {
  console.log(`\n🔍 Recherche des URLs d'audio traduit incorrectes...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (simulation)' : 'CORRECTION RÉELLE'}\n`);

  // Récupérer tous les attachments avec des traductions
  const attachments = await prisma.messageAttachment.findMany({
    where: {
      translations: {
        not: null
      }
    },
    select: {
      id: true,
      translations: true
    }
  });

  console.log(`📊 ${attachments.length} attachments avec traductions trouvés\n`);

  let fixedCount = 0;
  let totalUrlsFixed = 0;

  for (const attachment of attachments) {
    const translations = attachment.translations as unknown as AttachmentTranslations;
    if (!translations) continue;

    let needsFix = false;
    const fixedTranslations: AttachmentTranslations = {};

    for (const [lang, translation] of Object.entries(translations)) {
      if (!translation) continue;

      const url = translation.url || '';

      // Détecter les URLs incorrectes du translator
      if (url.includes('/outputs/audio/translated/') ||
          url.startsWith('/outputs/') ||
          (url && !url.startsWith('/api/v1/attachments/file/translated/'))) {

        // Générer l'URL correcte
        const ext = translation.format || 'mp3';
        const correctUrl = `/api/v1/attachments/file/translated/${attachment.id}_${lang}.${ext}`;

        console.log(`❌ ${attachment.id} [${lang}]:`);
        console.log(`   Ancienne URL: ${url}`);
        console.log(`   Nouvelle URL: ${correctUrl}`);

        fixedTranslations[lang] = {
          ...translation,
          url: correctUrl
        };
        needsFix = true;
        totalUrlsFixed++;
      } else {
        fixedTranslations[lang] = translation;
      }
    }

    if (needsFix) {
      fixedCount++;

      if (!dryRun) {
        await prisma.messageAttachment.update({
          where: { id: attachment.id },
          data: { translations: fixedTranslations as any }
        });
        console.log(`   ✅ Corrigé\n`);
      } else {
        console.log(`   🔄 Serait corrigé (dry run)\n`);
      }
    }
  }

  console.log(`\n📈 Résumé:`);
  console.log(`   - Attachments analysés: ${attachments.length}`);
  console.log(`   - Attachments à corriger: ${fixedCount}`);
  console.log(`   - URLs à corriger: ${totalUrlsFixed}`);

  if (dryRun && fixedCount > 0) {
    console.log(`\n💡 Pour appliquer les corrections, exécutez sans --dry-run`);
  }

  await prisma.$disconnect();
}

// Exécution
const dryRun = process.argv.includes('--dry-run');
fixTranslatedAudioUrls(dryRun)
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
