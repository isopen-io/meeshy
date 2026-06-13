/**
 * Migration : reclasser les POST existants en REEL selon leur contenu média.
 *
 * Critère REEL (demande produit 2026-06-13) :
 *   - a au moins une VIDÉO, OU
 *   - a au moins un AUDIO (seul ou avec photo(s)), OU
 *   - a PLUSIEURS (>= 2) PHOTOS.
 * Restent POST : texte seul, document(s) seul(s), ou UNE seule photo sans
 * audio/vidéo.
 *
 * Ne touche que `type = POST` non supprimés. STORY / STATUS / REEL existants
 * sont laissés intacts.
 *
 * SÛRETÉ : dry-run par défaut (aucune écriture). Passer `--apply` pour écrire.
 *
 *   # aperçu (lecture seule, montre les chiffres) :
 *   pnpm tsx scripts/migrations/reclassify-posts-to-reel.ts
 *   # application réelle :
 *   pnpm tsx scripts/migrations/reclassify-posts-to-reel.ts --apply
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../services/gateway/.env') });

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH = 500;

type MediaLite = { mimeType: string };

type Verdict = { isReel: boolean; reason: string };

function classify(media: MediaLite[]): Verdict {
  let video = 0;
  let audio = 0;
  let image = 0;
  let other = 0;
  for (const m of media) {
    const t = (m.mimeType || '').toLowerCase();
    if (t.startsWith('video/')) video++;
    else if (t.startsWith('audio/')) audio++;
    else if (t.startsWith('image/')) image++;
    else other++;
  }
  if (video > 0) return { isReel: true, reason: 'video' };
  if (audio > 0) return { isReel: true, reason: image > 0 ? 'audio+photo' : 'audio' };
  if (image >= 2) return { isReel: true, reason: 'multi-photo' };
  if (image === 1) return { isReel: false, reason: 'single-photo' };
  if (other > 0) return { isReel: false, reason: 'document-only' };
  return { isReel: false, reason: 'text-only' };
}

async function chunkUpdate(ids: string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const res = await prisma.post.updateMany({
      where: { id: { in: slice } },
      data: { type: 'REEL' },
    });
    total += res.count;
  }
  return total;
}

async function main() {
  console.log(`Mode : ${APPLY ? '🔴 APPLY (écriture)' : '🟢 DRY-RUN (lecture seule)'}`);

  const posts = await prisma.post.findMany({
    where: { type: 'POST', deletedAt: null },
    select: { id: true, media: { select: { mimeType: true } } },
  });
  console.log(`Posts type=POST (non supprimés) examinés : ${posts.length}`);

  const reasons: Record<string, number> = {};
  const toReel: string[] = [];
  for (const p of posts) {
    const v = classify(p.media);
    reasons[v.reason] = (reasons[v.reason] ?? 0) + 1;
    if (v.isReel) toReel.push(p.id);
  }

  console.log('\nRépartition par verdict :');
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    const tag = ['video', 'audio', 'audio+photo', 'multi-photo'].includes(reason) ? '→ REEL ' : '  reste POST';
    console.log(`  ${tag}  ${reason.padEnd(13)} : ${count}`);
  }
  console.log(`\n➡️  À reclasser en REEL : ${toReel.length}`);
  console.log('Aperçu (10 premiers ids) :');
  toReel.slice(0, 10).forEach((id) => console.log(`  ${id}`));

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN — aucune modification écrite. Relancer avec --apply pour appliquer.');
    return;
  }

  if (toReel.length === 0) {
    console.log('\nRien à appliquer.');
    return;
  }

  console.log(`\n🔴 Application sur ${toReel.length} posts...`);
  const updated = await chunkUpdate(toReel);
  console.log(`✅ ${updated} posts reclassés POST → REEL.`);

  const [reelCount, postCount] = await Promise.all([
    prisma.post.count({ where: { type: 'REEL', deletedAt: null } }),
    prisma.post.count({ where: { type: 'POST', deletedAt: null } }),
  ]);
  console.log(`\nVérification — type=REEL : ${reelCount} | type=POST restants : ${postCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur migration :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
