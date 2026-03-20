# Migration Data URI Avatars → Fichiers + Normalisation avatar

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convertir les avatars stockés en data URI (base64) en vrais fichiers sur disque, mettre à jour la DB avec les URLs, supprimer le workaround `sanitizeAvatar`, et normaliser le champ `avatarUrl` fantôme (inexistant en DB) pour ne garder que `avatar`.

**Architecture:** Script de migration one-shot qui query la DB pour les documents avec `avatar LIKE 'data:%'`, décode le base64, sauvegarde comme fichier via le même système que les uploads existants, et update la DB. Puis cleanup du code gateway + normalisation SDK.

**Tech Stack:** Node.js/TypeScript (script), Prisma (DB), UploadProcessor (file storage), Swift SDK (models)

---

### Task 1: Script de migration data URI → fichiers

**Files:**
- Create: `scripts/migrate-data-uri-avatars.ts`

**Step 1: Write the migration script**

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:3000';

function dataUriToBuffer(dataUri: string): { buffer: Buffer; ext: string; mimeType: string } {
  const match = dataUri.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (!match) throw new Error('Invalid data URI');
  return {
    buffer: Buffer.from(match[3], 'base64'),
    ext: match[2] === 'jpeg' ? 'jpg' : match[2],
    mimeType: match[1],
  };
}

function buildUrl(filePath: string): string {
  return `${PUBLIC_URL}/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
}

async function migrateModel(modelName: string, findMany: () => Promise<{ id: string; avatar: string | null }[]>, update: (id: string, avatar: string) => Promise<void>) {
  const records = await findMany();
  const dataUriRecords = records.filter(r => r.avatar?.startsWith('data:'));

  if (dataUriRecords.length === 0) {
    console.log(`[${modelName}] No data URI avatars found.`);
    return;
  }

  console.log(`[${modelName}] Found ${dataUriRecords.length} data URI avatar(s) to migrate.`);

  for (const record of dataUriRecords) {
    try {
      const { buffer, ext } = dataUriToBuffer(record.avatar!);
      const dirPath = path.join(UPLOAD_PATH, 'avatars', modelName.toLowerCase());
      fs.mkdirSync(dirPath, { recursive: true });

      const fileName = `${record.id}.${ext}`;
      const filePath = path.join('avatars', modelName.toLowerCase(), fileName);
      const fullPath = path.join(UPLOAD_PATH, filePath);

      fs.writeFileSync(fullPath, buffer);
      const url = buildUrl(filePath);

      await update(record.id, url);
      console.log(`  ✓ ${record.id} → ${url} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`  ✗ ${record.id}: ${err}`);
    }
  }
}

async function main() {
  console.log('=== Migration Data URI Avatars ===');
  console.log(`UPLOAD_PATH: ${UPLOAD_PATH}`);
  console.log(`PUBLIC_URL: ${PUBLIC_URL}`);
  console.log('');

  await migrateModel('User',
    () => prisma.user.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.user.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('Conversation',
    () => prisma.conversation.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.conversation.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('ConversationMember',
    () => prisma.conversationMember.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.conversationMember.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('Community',
    () => prisma.community.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.community.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  console.log('\n=== Migration Complete ===');
  await prisma.$disconnect();
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
```

**Step 2: Run locally to verify (dev)**

```bash
cd services/gateway
npx tsx ../../scripts/migrate-data-uri-avatars.ts
```

Expected: Logs showing migrated records or "No data URI avatars found."

**Step 3: Run on production**

```bash
# SSH into production
ssh root@meeshy.me
cd /opt/meeshy/production

# Run inside the gateway container (has access to DB + UPLOAD_PATH)
docker exec -it meeshy-gateway sh -c "node -e \"$(cat scripts/migrate-data-uri-avatars.js)\""
# OR copy script and run with tsx
docker cp scripts/migrate-data-uri-avatars.ts meeshy-gateway:/tmp/
docker exec -it meeshy-gateway npx tsx /tmp/migrate-data-uri-avatars.ts
```

**Step 4: Commit**

```bash
git add scripts/migrate-data-uri-avatars.ts
git commit -m "feat(scripts): add data URI avatar migration to file storage"
```

---

### Task 2: Supprimer `sanitizeAvatar` et `avatarUrl` du gateway

Le schema Prisma n'a qu'un champ `avatar` — le gateway fabrique un `avatarUrl` fantôme qui n'existe pas en DB. Après migration, `sanitizeAvatar` n'est plus nécessaire et `avatarUrl` est redondant.

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts`
- Modify: `services/gateway/src/routes/conversations/core.ts`
- Modify: `services/gateway/src/routes/conversations/search.ts`

**Step 1: Nettoyer `messages.ts`**

Supprimer la fonction `sanitizeAvatar` (lignes 30-39).

Remplacer toutes les occurrences de `sanitizeAvatar(...)` par l'expression directe, et supprimer les lignes `avatarUrl`:

- Ligne 768: `avatar: sanitizeAvatar(message.sender.avatar) ?? sanitizeAvatar(message.sender.user?.avatar) ?? null` → `avatar: message.sender.avatar ?? message.sender.user?.avatar ?? null`
- Ligne 769: supprimer `avatarUrl: ...`
- Ligne 800: `avatar: sanitizeAvatar(replySender.avatar) ?? sanitizeAvatar(replySender.user?.avatar) ?? null` → `avatar: replySender.avatar ?? replySender.user?.avatar ?? null`
- Ligne 868: `avatar: sanitizeAvatar((original.sender as any).avatar) ?? sanitizeAvatar((original.sender as any).user?.avatar) ?? null` → `avatar: (original.sender as any).avatar ?? (original.sender as any).user?.avatar ?? null`

**Step 2: Nettoyer `core.ts`**

Supprimer la fonction `sanitizeAvatar` (lignes 32-36).

- Ligne 470: `avatar: sanitizeAvatar(m.avatar)` → `avatar: m.avatar`
- Ligne 473: `avatar: sanitizeAvatar(userMap.get(m.userId)?.avatar)` → `avatar: userMap.get(m.userId)?.avatar`
- Ligne 474: `{ ...m.user, avatar: sanitizeAvatar(m.user?.avatar) }` → `{ ...m.user, avatar: m.user?.avatar }`
- Ligne 510: `avatar: sanitizeAvatar(sender.avatar) ?? sanitizeAvatar(sender.user?.avatar) ?? null` → `avatar: sender.avatar ?? sender.user?.avatar ?? null`
- Ligne 511: supprimer `avatarUrl: ...`

**Step 3: Nettoyer `search.ts`**

Supprimer la fonction `sanitizeAvatar` (lignes 12-16).

- Ligne 180: `avatar: sanitizeAvatar(m.avatar)` → `avatar: m.avatar`
- Ligne 181: `{ ...m.user, avatar: sanitizeAvatar(m.user.avatar) }` → `m.user` (pas besoin de spread juste pour avatar)
- Ligne 200: `avatar: sanitizeAvatar(sender.avatar) ?? sanitizeAvatar(sender.user?.avatar) ?? null` → `avatar: sender.avatar ?? sender.user?.avatar ?? null`
- Ligne 201: supprimer `avatarUrl: ...`

**Step 4: Vérifier la compilation**

```bash
cd services/gateway && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/messages.ts services/gateway/src/routes/conversations/core.ts services/gateway/src/routes/conversations/search.ts
git commit -m "fix(gateway): remove sanitizeAvatar workaround and avatarUrl ghost field"
```

---

### Task 3: Normaliser le SDK — supprimer `avatarUrl`, garder `avatar`

Le gateway n'envoie plus `avatarUrl`. Le SDK doit mapper `avatar` uniquement. Les structs qui ont `avatarUrl` doivent le supprimer et utiliser `avatar` seul.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/StoryServiceTests.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/ConversationServiceTests.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift`

**Step 1: `ConversationModels.swift`**

`APIConversationUserNested` (ligne 5-15) — supprimer `avatarUrl`:
```swift
public struct APIConversationUserNested: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
}
```

`APIConversationUser` (ligne 17-46) — supprimer `avatarUrl`, simplifier `resolvedAvatar`:
```swift
public struct APIConversationUser: Decodable, Sendable {
    public let id: String
    public let userId: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let type: String?
    public let user: APIConversationUserNested?

    public var name: String {
        nonEmpty(displayName) ?? nonEmpty(user?.displayName) ?? nonEmpty(username) ?? nonEmpty(user?.username) ?? id
    }

    public var resolvedAvatar: String? {
        nonEmpty(avatar) ?? nonEmpty(user?.avatar)
    }

    // ... rest unchanged
}
```

**Step 2: `PostModels.swift`**

`APIAuthor` (ligne 5-13) — supprimer `avatarUrl`:
```swift
public struct APIAuthor: Decodable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?

    public var name: String { displayName ?? username ?? "Anonymous" }
}
```

Mettre à jour les usages de `author.avatar ?? author.avatarUrl` → `author.avatar`:
- Ligne 151: `authorAvatarURL: c.author.avatar ?? c.author.avatarUrl` → `authorAvatarURL: c.author.avatar`
- Ligne 160: `authorAvatarURL: r.author.avatar ?? r.author.avatarUrl` → `authorAvatarURL: r.author.avatar`
- Ligne 171: `authorAvatarURL: author.avatar ?? author.avatarUrl` → `authorAvatarURL: author.avatar`

**Step 3: `StoryModels.swift`**

- Ligne 726: `avatarURL: data.author.avatar ?? data.author.avatarUrl` → `avatarURL: data.author.avatar`

**Step 4: Mettre à jour les tests**

Supprimer `avatarUrl: nil` de tous les init `APIAuthor(...)` et `APIConversationUser(...)` dans les test files.

**Step 5: Vérifier build + tests**

```bash
./apps/ios/meeshy.sh build
```

**Step 6: Commit**

```bash
git add packages/MeeshySDK/ apps/ios/
git commit -m "fix(sdk): normalize avatar field, remove ghost avatarUrl"
```

---

### Task 4: Supprimer `avatarUrl` des types shared (web)

**Files:**
- Modify: `packages/shared/types/post.ts` — supprimer `avatarUrl` de l'interface auteur

**Step 1: Nettoyer le type**

```typescript
// packages/shared/types/post.ts — supprimer la ligne avatarUrl
```

**Step 2: Vérifier si le web app utilise `avatarUrl`**

```bash
grep -r "avatarUrl" apps/web/
```

Si des usages existent, les remplacer par `avatar`.

**Step 3: Commit**

```bash
git add packages/shared/ apps/web/
git commit -m "fix(shared,web): normalize avatar field, remove avatarUrl"
```
