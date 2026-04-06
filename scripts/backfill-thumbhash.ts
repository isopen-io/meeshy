/**
 * Backfill ThumbHash for existing attachments.
 *
 * Run from the gateway container in production:
 *   docker exec -it meeshy-gateway npx tsx /app/scripts/backfill-thumbhash.ts
 *
 * Or locally:
 *   cd services/gateway && npx tsx ../../scripts/backfill-thumbhash.ts
 *
 * Options:
 *   --type=image    Only process images (default: all visual types)
 *   --type=video    Only process videos
 *   --type=pdf      Only process PDFs
 *   --batch=50      Batch size (default: 50)
 *   --dry-run       Count without processing
 */

import { PrismaClient } from '@prisma/client'
import path from 'path'

const prisma = new PrismaClient()
const UPLOAD_BASE = process.env.UPLOAD_PATH || '/app/uploads'

// Parse CLI args
const args = process.argv.slice(2)
const typeFilter = args.find(a => a.startsWith('--type='))?.split('=')[1]
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '50')
const dryRun = args.includes('--dry-run')

function buildMimeFilter(): string | object {
  switch (typeFilter) {
    case 'image': return { startsWith: 'image/' }
    case 'video': return { startsWith: 'video/' }
    case 'pdf': return 'application/pdf'
    default: return { in: [] } // handled below
  }
}

async function main() {
  console.log(`\n🔧 ThumbHash Backfill`)
  console.log(`   Upload base: ${UPLOAD_BASE}`)
  console.log(`   Batch size:  ${batchSize}`)
  console.log(`   Type filter: ${typeFilter || 'all visual'}`)
  console.log(`   Dry run:     ${dryRun}\n`)

  // Dynamic import — ThumbHashGenerator is ESM in the gateway
  const { ThumbHashGenerator } = await import(
    '../services/gateway/src/services/attachments/ThumbHashGenerator.js'
  ).catch(() => {
    // Fallback: try relative to /app in Docker
    return import('/app/dist/services/attachments/ThumbHashGenerator.js')
  })

  // Build where clause
  const mimeConditions = typeFilter
    ? [{ mimeType: buildMimeFilter() as any }]
    : [
        { mimeType: { startsWith: 'image/' } },
        { mimeType: { startsWith: 'video/' } },
        { mimeType: 'application/pdf' },
      ]

  const where = {
    thumbHash: null,
    OR: mimeConditions,
  }

  // Count total
  const total = await prisma.messageAttachment.count({ where })
  console.log(`📊 ${total} attachments to process\n`)

  if (dryRun || total === 0) {
    await prisma.$disconnect()
    return
  }

  let processed = 0
  let succeeded = 0
  let failed = 0
  let skipped = 0
  let cursor: string | undefined

  while (true) {
    const batch = await prisma.messageAttachment.findMany({
      where,
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, filePath: true, mimeType: true },
      orderBy: { createdAt: 'desc' }, // Newest first
    })

    if (batch.length === 0) break

    for (const att of batch) {
      processed++
      const absolutePath = path.join(UPLOAD_BASE, att.filePath)

      try {
        const thumbHash = await ThumbHashGenerator.generate(absolutePath, att.mimeType)
        if (thumbHash) {
          await prisma.messageAttachment.update({
            where: { id: att.id },
            data: { thumbHash },
          })
          succeeded++
        } else {
          skipped++
        }
      } catch (err: any) {
        failed++
        if (failed <= 10) {
          console.error(`   ❌ ${att.id} (${att.mimeType}): ${err.message}`)
        }
      }

      if (processed % 100 === 0) {
        const pct = ((processed / total) * 100).toFixed(1)
        console.log(`   ⏳ ${processed}/${total} (${pct}%) — ✅ ${succeeded} | ❌ ${failed} | ⏭️ ${skipped}`)
      }
    }

    cursor = batch[batch.length - 1].id
  }

  console.log(`\n✅ Backfill complete:`)
  console.log(`   Total:     ${processed}`)
  console.log(`   Succeeded: ${succeeded}`)
  console.log(`   Failed:    ${failed}`)
  console.log(`   Skipped:   ${skipped}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
