#!/usr/bin/env tsx
/**
 * Migration: Data URI avatars → file storage
 *
 * Usage:
 *   npx tsx scripts/migrate-data-uri-avatars.ts           # live run
 *   npx tsx scripts/migrate-data-uri-avatars.ts --dry-run # preview only, no writes
 *
 * Run inside gateway container on production:
 *   docker cp scripts/migrate-data-uri-avatars.ts meeshy-gateway:/tmp/
 *   docker exec meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts --dry-run
 *   docker exec meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;
const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:3000';
const AVATAR_SIZE = 512;
const JPEG_QUALITY = 85;

type MigrateRecord = { id: string; avatar: string | null };

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  const match = dataUri.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
  if (!match) throw new Error(`Not a valid image data URI (prefix: ${dataUri.slice(0, 40)})`);
  return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] };
}

async function processAvatarBuffer(rawBuffer: Buffer): Promise<Buffer> {
  return sharp(rawBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: JPEG_QUALITY, progressive: true })
    .toBuffer();
}

function buildFileUrl(relPath: string): string {
  return `${PUBLIC_URL}/api/v1/attachments/file/${relPath}`;
}

async function migrateModel(
  modelName: string,
  findBatch: (skip: number) => Promise<MigrateRecord[]>,
  updateRecord: (id: string, avatar: string) => Promise<void>
): Promise<{ migrated: number; skipped: number; failed: number }> {
  let skip = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const destBaseDir = path.join(UPLOAD_PATH, 'avatars', modelName.toLowerCase());

  if (!DRY_RUN) {
    await fs.mkdir(destBaseDir, { recursive: true });
  }

  console.log(`\n[${modelName}] Starting migration (dry-run=${DRY_RUN})...`);

  while (true) {
    const batch = await findBatch(skip);
    if (batch.length === 0) break;

    for (const record of batch) {
      // Idempotency: skip if already a proper URL or null
      if (!record.avatar || !record.avatar.startsWith('data:')) {
        skipped++;
        continue;
      }

      try {
        const { buffer: rawBuffer } = dataUriToBuffer(record.avatar);
        const processedBuffer = await processAvatarBuffer(rawBuffer);

        const relPath = path.join('avatars', modelName.toLowerCase(), `${record.id}.jpg`);
        const fullPath = path.join(UPLOAD_PATH, relPath);
        const fileUrl = buildFileUrl(relPath);

        if (DRY_RUN) {
          console.log(`  [DRY-RUN] ${record.id} → ${fileUrl} (${processedBuffer.length} bytes)`);
        } else {
          await fs.writeFile(fullPath, processedBuffer);
          await updateRecord(record.id, fileUrl);
          console.log(`  [OK] ${record.id} → ${fileUrl} (${processedBuffer.length} bytes)`);
        }
        migrated++;
      } catch (err) {
        console.error(`  [FAIL] ${record.id}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    skip += BATCH_SIZE;
    console.log(`  Progress: processed ${skip} ${modelName} records so far...`);

    if (batch.length < BATCH_SIZE) break;
  }

  return { migrated, skipped, failed };
}

async function main() {
  console.log('=== Migration Data URI Avatars ===');
  console.log(`UPLOAD_PATH : ${UPLOAD_PATH}`);
  console.log(`PUBLIC_URL  : ${PUBLIC_URL}`);
  console.log(`DRY_RUN     : ${DRY_RUN}`);
  console.log(`BATCH_SIZE  : ${BATCH_SIZE}`);

  const results: Record<string, { migrated: number; skipped: number; failed: number }> = {};

  results['User'] = await migrateModel(
    'User',
    (skip) => prisma.user.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.user.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results['Conversation'] = await migrateModel(
    'Conversation',
    (skip) => prisma.conversation.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.conversation.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results['Participant'] = await migrateModel(
    'Participant',
    (skip) => prisma.participant.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.participant.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results['Community'] = await migrateModel(
    'Community',
    (skip) => prisma.community.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.community.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  console.log('\n=== Summary ===');
  let totalFailed = 0;
  for (const [model, stats] of Object.entries(results)) {
    console.log(`  ${model}: migrated=${stats.migrated}, skipped=${stats.skipped}, failed=${stats.failed}`);
    totalFailed += stats.failed;
  }

  await prisma.$disconnect();

  if (totalFailed > 0) {
    console.error(`\n[WARN] ${totalFailed} record(s) failed to migrate. Check logs above.`);
    process.exit(1);
  }

  console.log('\n=== Migration Complete ===');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
