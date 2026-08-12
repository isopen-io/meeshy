/**
 * Migration : repasser en POST les REEL existants NON CONFORMES à la règle de
 * composition.
 *
 * Règle produit (directive user 2026-08-02, étendue par la directive durée
 * minimale) — un post n'est un RÉEL que si sa composition porte :
 *   - au moins une VIDÉO d'au moins 3 secondes, OU
 *   - au moins un AUDIO d'au moins 3 secondes, OU
 *   - PLUSIEURS (>= 2) IMAGES (jamais soumises à une condition de durée).
 * Tout REEL qui ne satisfait pas cette règle (texte seul, une seule image,
 * document(s), vidéo/audio de moins de 3 secondes) redevient un POST. Corpus
 * visé (E11) : les REEL 1-image créés par les clients de l'ancienne doctrine
 * « >= 1 média → REEL » ; et les REEL vidéo/audio courts créés avant la
 * directive durée minimale.
 *
 * Prédicat : MIROIR de `services/gateway/src/services/posts/reelComposition.ts`
 * (qui reflète lui-même le SDK `ReelComposition.qualifiesAsReel`). Inverse de
 * `reclassify-posts-to-reel.ts` (2026-06-13), qui promouvait les POST
 * qualifiants — celui-ci rétrograde les REEL non qualifiants.
 *
 * Ne touche que `type = REEL` non supprimés. POST / STORY / STATUS sont
 * laissés intacts.
 *
 * SÛRETÉ : dry-run par défaut (aucune écriture). Passer `--apply` pour écrire.
 *
 *   # aperçu (lecture seule, montre les chiffres) :
 *   pnpm tsx scripts/migrations/reclassify-nonqualifying-reels-to-post.ts
 *   # application réelle :
 *   pnpm tsx scripts/migrations/reclassify-nonqualifying-reels-to-post.ts --apply
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../services/gateway/.env') });

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH = 500;

type MediaLite = { mimeType: string | null; duration: number | null };

type Verdict = { qualifies: boolean; reason: string };

const MIN_QUALIFYING_DURATION_MS = 3000;

function meetsMinDuration(duration: number | null): boolean {
  return typeof duration === 'number' && duration >= MIN_QUALIFYING_DURATION_MS;
}

function classify(media: MediaLite[]): Verdict {
  const entries = media.map((m) => ({ mime: (m.mimeType ?? '').toLowerCase(), duration: m.duration }));
  const video = entries.filter((e) => e.mime.startsWith('video/'));
  const audio = entries.filter((e) => e.mime.startsWith('audio/'));
  const image = entries.filter((e) => e.mime.startsWith('image/')).length;
  if (video.some((e) => meetsMinDuration(e.duration))) return { qualifies: true, reason: 'video' };
  if (audio.some((e) => meetsMinDuration(e.duration))) {
    return { qualifies: true, reason: image > 0 ? 'audio+photo' : 'audio' };
  }
  if (image >= 2) return { qualifies: true, reason: 'multi-photo' };
  if (video.length > 0) return { qualifies: false, reason: 'video-too-short' };
  if (audio.length > 0) return { qualifies: false, reason: 'audio-too-short' };
  if (image === 1) return { qualifies: false, reason: 'single-photo' };
  if (media.length > 0) return { qualifies: false, reason: 'document-only' };
  return { qualifies: false, reason: 'no-media' };
}

async function chunkUpdate(ids: string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const res = await prisma.post.updateMany({
      where: { id: { in: slice } },
      data: { type: 'POST' },
    });
    total += res.count;
  }
  return total;
}

async function main() {
  console.log(`Mode : ${APPLY ? '🔴 APPLY (écriture)' : '🟢 DRY-RUN (lecture seule)'}`);

  const reels = await prisma.post.findMany({
    where: { type: 'REEL', deletedAt: null },
    select: { id: true, media: { select: { mimeType: true, duration: true } } },
  });
  console.log(`Posts type=REEL (non supprimés) examinés : ${reels.length}`);

  const reasons: Record<string, number> = {};
  const toPost: string[] = [];
  for (const r of reels) {
    const v = classify(r.media);
    reasons[v.reason] = (reasons[v.reason] ?? 0) + 1;
    if (!v.qualifies) toPost.push(r.id);
  }

  console.log('\nRépartition par verdict :');
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    const tag = ['single-photo', 'document-only', 'no-media', 'video-too-short', 'audio-too-short'].includes(reason)
      ? '→ POST '
      : '  reste REEL';
    console.log(`  ${tag}  ${reason.padEnd(13)} : ${count}`);
  }
  console.log(`\n➡️  À reclasser en POST : ${toPost.length}`);
  console.log('Aperçu (10 premiers ids) :');
  toPost.slice(0, 10).forEach((id) => console.log(`  ${id}`));

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN — aucune modification écrite. Relancer avec --apply pour appliquer.');
    return;
  }

  if (toPost.length === 0) {
    console.log('\nRien à appliquer.');
    return;
  }

  console.log(`\n🔴 Application sur ${toPost.length} réels...`);
  const updated = await chunkUpdate(toPost);
  console.log(`✅ ${updated} posts reclassés REEL → POST.`);

  const [reelCount, postCount] = await Promise.all([
    prisma.post.count({ where: { type: 'REEL', deletedAt: null } }),
    prisma.post.count({ where: { type: 'POST', deletedAt: null } }),
  ]);
  console.log(`\nVérification — type=REEL restants : ${reelCount} | type=POST : ${postCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur migration :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
