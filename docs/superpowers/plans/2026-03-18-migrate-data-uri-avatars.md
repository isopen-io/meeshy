# Plan: Migrate Data URI Avatars to File Storage

> **For agentic worker:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> Working directory: `/Users/smpceo/Documents/v2_meeshy`
>
> **Dependency order:** Task 1 (harden migration script) → Task 1 execution on prod → Task 2 (validate API blocks data URIs) are independent. Task 3 (confirm no sanitizeAvatar debt) depends on Task 1 being run.

---

## Context (from codebase audit)

Some avatars in MongoDB are stored as base64 data URIs (`data:image/png;base64,...`) instead of proper file URLs. Root causes:

- iOS keychain stores `User.avatar` → `SecItemAdd` warns "keychain item data exceeds reasonable size" when value is a multi-KB base64 string
- A migration script exists at `scripts/migrate-data-uri-avatars.ts` but lacks dry-run mode, batching, idempotency, and image normalization via Sharp

**What does NOT need to be done (already correct):**
- `sanitizeAvatar()` does NOT exist in the current gateway codebase — no cleanup needed
- `avatarUrl` is NOT a ghost DB/API field — it is only a local variable name in web components and a ViewModel property in `CommunitySettingsView.swift`, not an API model field
- `updateAvatarSchema` in `packages/shared/utils/validation.ts` already rejects any non-HTTP(S) string (Zod refine blocks `data:` URIs at the gateway level)

**Prisma model names with `avatar` field (verified in `packages/shared/prisma/schema.prisma`):**
- `User.avatar` (line 97)
- `Conversation.avatar` (line 295)
- `Participant.avatar` (line 452)
- `Community.avatar` (line 1151)

---

## Task 1: Harden the Migration Script

**Files:**
- Modify: `scripts/migrate-data-uri-avatars.ts`

**Goal:** Add dry-run mode (`--dry-run`), batching (100 records at a time), idempotency (skip records whose `avatar` already starts with `http`), and Sharp-based image normalization (resize to 512×512 JPEG to normalize formats and reduce size).

- [ ] **Step 1.1:** Read the current script at `scripts/migrate-data-uri-avatars.ts` (already read — content confirmed)

- [ ] **Step 1.2:** Rewrite `scripts/migrate-data-uri-avatars.ts` with the following improvements:

```typescript
#!/usr/bin/env tsx
/**
 * Migration: Data URI avatars → file storage
 *
 * Usage:
 *   npx tsx scripts/migrate-data-uri-avatars.ts           # live run
 *   npx tsx scripts/migrate-data-uri-avatars.ts --dry-run # preview only, no writes
 *
 * Run inside gateway container on production:
 *   docker exec -it meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts
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
      // Idempotency: skip if already a proper URL
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

  results.User = await migrateModel(
    'User',
    (skip) => prisma.user.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.user.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results.Conversation = await migrateModel(
    'Conversation',
    (skip) => prisma.conversation.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.conversation.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results.Participant = await migrateModel(
    'Participant',
    (skip) => prisma.participant.findMany({
      skip,
      take: BATCH_SIZE,
      select: { id: true, avatar: true }
    }),
    (id, avatar) => prisma.participant.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  results.Community = await migrateModel(
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
```

- [ ] **Step 1.3:** Verify TypeScript compiles without errors:
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit ../../scripts/migrate-data-uri-avatars.ts --moduleResolution bundler --module esnext --target esnext --esModuleInterop 2>/dev/null || cd /Users/smpceo/Documents/v2_meeshy && npx tsx --check scripts/migrate-data-uri-avatars.ts
```

- [ ] **Step 1.4:** Run in dry-run mode locally (requires gateway env with DATABASE_URL set):
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
DATABASE_URL="$(grep DATABASE_URL .env | cut -d= -f2-)" \
UPLOAD_PATH=/app/uploads \
PUBLIC_URL=http://localhost:3000 \
npx tsx ../../scripts/migrate-data-uri-avatars.ts --dry-run
```
Expected output: `[DRY-RUN]` lines for any data URI avatars, or `No data URI avatars found.` per model.

- [ ] **Step 1.5:** Run live on production (inside gateway container which has `UPLOAD_PATH`, `DATABASE_URL`, `PUBLIC_URL` set):
```bash
# Copy script to production container
docker cp /Users/smpceo/Documents/v2_meeshy/scripts/migrate-data-uri-avatars.ts meeshy-gateway:/tmp/

# Dry-run first
docker exec meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts --dry-run

# If dry-run output looks correct, run live
docker exec meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts
```
Expected: `migrated=N, skipped=M, failed=0` in summary. Exit code 0.

- [ ] **Step 1.6:** Commit:
```bash
git add scripts/migrate-data-uri-avatars.ts
git commit -m "$(cat <<'EOF'
fix(scripts): harden data URI avatar migration with dry-run, batching, idempotency, Sharp

Adds --dry-run flag, 100-record batching, idempotency (skip HTTP URLs),
and Sharp-based JPEG normalization (512x512) to the migration script.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Strengthen API-Level Validation Against Data URI Avatars

**Context:** `updateAvatarSchema` in `packages/shared/utils/validation.ts` already rejects non-HTTP(S) strings via Zod. The Fastify route schema uses `format: 'uri'` which, per RFC 3986, technically allows `data:` URIs through `ajv`. The Zod layer is the real guard — but the error message should be explicit.

**Files:**
- Modify: `packages/shared/utils/validation.ts` (lines 242–250)
- Modify: `services/gateway/src/routes/users/profile.ts` — add `data:` check before Zod parse as defense-in-depth

- [ ] **Step 2.1:** Read `packages/shared/utils/validation.ts` lines 240–265 to verify current state.

- [ ] **Step 2.2:** Update `updateAvatarSchema` to also explicitly reject `data:` URIs with a clearer error:

Current (lines 242–250):
```typescript
export const updateAvatarSchema = z.object({
  avatar: z.string().refine(
    (data) => {
      return data.startsWith('http://') ||
             data.startsWith('https://');
    },
    'Format avatar invalide. Doit être une URL HTTP(S)'
  )
}).strict();
```

Replace with:
```typescript
export const updateAvatarSchema = z.object({
  avatar: z.string()
    .refine(
      (val) => !val.startsWith('data:'),
      'Avatar must be a file URL, not a base64 data URI'
    )
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      'Avatar must be an HTTP or HTTPS URL'
    )
}).strict();
```

- [ ] **Step 2.3:** In `services/gateway/src/routes/users/profile.ts`, inside `updateUserAvatar` (around line 352), add an early guard before calling `updateAvatarSchema.parse`:

Add after `const userId = authContext.userId;` and before `const body = updateAvatarSchema.parse(request.body);`:
```typescript
const rawBody = request.body as { avatar?: unknown };
if (typeof rawBody.avatar === 'string' && rawBody.avatar.startsWith('data:')) {
  return reply.status(400).send({
    success: false,
    error: 'Avatar must be a file URL. Data URI (base64) avatars are not accepted.'
  });
}
```

- [ ] **Step 2.4:** Verify TypeScript compilation:
```bash
cd /Users/smpceo/Documents/v2_meeshy && npx tsc -p packages/shared/tsconfig.json --noEmit && npx tsc -p services/gateway/tsconfig.json --noEmit
```

- [ ] **Step 2.5:** Commit:
```bash
git add packages/shared/utils/validation.ts services/gateway/src/routes/users/profile.ts
git commit -m "$(cat <<'EOF'
fix(gateway,shared): explicitly reject data URI avatars at API boundary

Adds defense-in-depth: Zod schema now has an explicit data: prefix check
with a clear error message, and the avatar route adds a fast-path guard
before schema parsing.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Confirm No Residual sanitizeAvatar / avatarUrl Debt

**Context (verified in codebase):** `sanitizeAvatar()` does not exist anywhere in the current `services/gateway/src/` source. The `avatarUrl` field is not an API model field — it is only used as a local variable name in web components and a ViewModel property in the iOS `CommunitySettingsView`. The shared types package does not expose `avatarUrl`. No action required unless the audit below finds regressions.

**Files:**
- Read-only audit pass

- [ ] **Step 3.1:** Confirm no `sanitizeAvatar` usage exists:
```bash
grep -r "sanitizeAvatar" /Users/smpceo/Documents/v2_meeshy/services/gateway/src --include="*.ts"
```
Expected: no output. If any matches found, remove the function and inline `avatar` pass-through.

- [ ] **Step 3.2:** Confirm no `avatarUrl` field in API response shapes (shared types):
```bash
grep -r "avatarUrl" /Users/smpceo/Documents/v2_meeshy/packages/shared/types --include="*.ts"
grep -r "avatarUrl" /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models --include="*.swift"
```
Expected: no output for either command. If any model struct exposes `avatarUrl` as a Decodable/CodingKey, remove it and update callers to use `avatar`.

- [ ] **Step 3.3:** If Step 3.1 or 3.2 finds anything, apply targeted removals and run:
```bash
# Gateway
cd /Users/smpceo/Documents/v2_meeshy && npx tsc -p services/gateway/tsconfig.json --noEmit

# SDK (if Swift files changed)
./apps/ios/meeshy.sh build
```

- [ ] **Step 3.4:** Commit only if changes were needed:
```bash
git add <changed files>
git commit -m "$(cat <<'EOF'
fix(gateway,sdk): remove residual sanitizeAvatar/avatarUrl after data URI migration

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
If no changes needed, skip the commit and note: "Task 3 — no action required, codebase already clean."

---

## Verification Checklist

After all tasks are complete:

- [ ] `grep -r "sanitizeAvatar" services/gateway/src` → no output
- [ ] `grep -r "data:" services/gateway/src --include="*.ts" | grep -i avatar` → no output
- [ ] `grep -r "avatarUrl" packages/shared/types packages/MeeshySDK/Sources/MeeshySDK/Models` → no output
- [ ] `npx tsc -p services/gateway/tsconfig.json --noEmit` → no errors
- [ ] `npx tsc -p packages/shared/tsconfig.json --noEmit` → no errors
- [ ] Migration script ran on production with `failed=0`
- [ ] iOS keychain warning "keychain item data exceeds reasonable size" no longer appears for avatar storage
