# ThumbHash Implementation Plan

> **Date**: 2026-04-06
> **Scope**: Gateway + Shared + MeeshySDK + iOS app
> **Objectif**: Chaque attachment avec composante visuelle (image, video, GIF, PDF, document) a un placeholder colore instantane (< 1ms decode) avant meme le debut du telechargement

---

## 1. Concept

```
AVANT (actuel):
  API response → CachedAsyncImage → shimmer gris → [300-800ms] → image
  
APRES (ThumbHash):
  API response contient thumbHash (33 chars base64)
  → decode 0.1ms → placeholder colore fidele → [300-800ms] → image reelle

Timeline visuelle:
  t=0ms    : ThumbHash decode → image floue coloree (INSTANT)
  t=50ms   : Thumbnail basse-res (si prefetch actif)
  t=300ms  : Image pleine resolution
```

ThumbHash encode une miniature ~32x32 en **25-33 bytes** (base64: ~33-44 chars). Le hash voyage dans le JSON de l'API, pas de requete HTTP supplementaire. Le decode cote iOS est < 1ms — zero impact sur le rendering.

---

## 2. Architecture

```
UPLOAD (une seule fois par attachment)
┌─────────────────────────────────────────────────┐
│ Client upload fichier                            │
│        ↓                                         │
│ Gateway: UploadProcessor.uploadFile()            │
│        ↓                                         │
│ MetadataManager.extractMetadata()                │
│        ↓                                         │
│ [NOUVEAU] ThumbHashGenerator.generate(filePath)  │
│   ├── Image: sharp → resize 100x100 → RGBA      │
│   ├── Video: ffmpeg frame 1 → sharp → RGBA       │
│   ├── GIF: sharp (frame 1) → RGBA                │
│   ├── PDF: pdf2pic page 1 → sharp → RGBA         │
│   └── Autre doc: placeholder pre-calcule          │
│        ↓                                         │
│ rgbaToThumbHash(w, h, rgba) → Uint8Array (25b)  │
│        ↓                                         │
│ Base64 encode → "2fcaGQB3h3h4eIeF..."           │
│        ↓                                         │
│ Prisma: MessageAttachment.update({ thumbHash })  │
└─────────────────────────────────────────────────┘

API RESPONSE (chaque requete)
┌─────────────────────────────────────────────────┐
│ GET /conversations/:id/messages                  │
│ GET /posts/feed                                  │
│ GET /stories                                     │
│        ↓                                         │
│ Response JSON inclut:                            │
│ {                                                │
│   "attachments": [{                              │
│     "fileUrl": "/uploads/photo.jpg",             │
│     "thumbHash": "2fcaGQB3h3h4eIeFeEh3eYhw",   │ ← NOUVEAU
│     "thumbnailUrl": "/uploads/photo_thumb.jpg",  │
│     "width": 1920, "height": 1080                │
│   }]                                             │
│ }                                                │
└─────────────────────────────────────────────────┘

iOS DISPLAY (chaque rendu)
┌─────────────────────────────────────────────────┐
│ ProgressiveCachedImage(                          │
│   thumbHash: attachment.thumbHash,  ← NOUVEAU    │
│   thumbnailUrl: attachment.thumbnailUrl,         │
│   fullUrl: attachment.fileUrl                    │
│ )                                                │
│        ↓                                         │
│ init:                                            │
│   1. thumbHash → UIImage.fromThumbHash() (0.1ms)│
│   2. Check DiskCacheStore pour full image        │
│        ↓                                         │
│ body:                                            │
│   fullImage ?? thumbnailImage ?? thumbHashImage   │
│        ↓                                         │
│ .task:                                           │
│   1. Load thumbnail (async)                      │
│   2. Load full image (async)                     │
│   Chaque etape remplace la precedente avec fade  │
└─────────────────────────────────────────────────┘
```

---

## 3. Fichiers a modifier

### 3.1 Gateway (serveur)

| Fichier | Action | Description |
|---|---|---|
| `services/gateway/package.json` | **MODIFIER** | Ajouter dep `thumbhash` |
| `services/gateway/src/services/attachments/ThumbHashGenerator.ts` | **CREER** | Service de generation ThumbHash |
| `services/gateway/src/services/attachments/UploadProcessor.ts` | **MODIFIER** | Appeler ThumbHashGenerator apres extractMetadata (ligne ~325) |
| `services/gateway/src/services/attachments/MetadataManager.ts` | **MODIFIER** | Optionnel: integrer dans extractMetadata() |

### 3.2 Shared (schema + types)

| Fichier | Action | Description |
|---|---|---|
| `packages/shared/prisma/schema.prisma` | **MODIFIER** | Ajouter champ `thumbHash String?` sur MessageAttachment |
| `packages/shared/types/api-schemas.ts` | **MODIFIER** | Ajouter `thumbHash` dans messageAttachmentSchema |

### 3.3 MeeshySDK (iOS)

| Fichier | Action | Description |
|---|---|---|
| `MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift` | **CREER** | Vendor du fichier thumbhash.swift (~200 lignes) + extension UIImage |
| `MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift` | **MODIFIER** | Ajouter `thumbHash: String?` sur APIMessageAttachment |
| `MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` | **MODIFIER** | Ajouter `thumbHash: String?` sur MeeshyMessageAttachment |
| `MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | **MODIFIER** | Ajouter `thumbHash: String?` sur FeedMedia |
| `MeeshyUI/Primitives/CachedAsyncImage.swift` | **MODIFIER** | ProgressiveCachedImage: ajouter thumbHash comme placeholder tier 0 |

### 3.4 iOS App

| Fichier | Action | Description |
|---|---|---|
| `apps/ios/.../Views/FeedPostCard+Media.swift` | **MODIFIER** | Passer thumbHash a ProgressiveCachedImage |
| `apps/ios/.../Views/ThemedMessageBubble+Media.swift` | **MODIFIER** | Passer thumbHash aux composants image/video |
| `apps/ios/.../Views/StoryViewerView+Content.swift` | **MODIFIER** | Passer thumbHash pour les medias de stories |

---

## 4. Implementation detaillee

### Phase 1 : Gateway — ThumbHashGenerator

```typescript
// services/gateway/src/services/attachments/ThumbHashGenerator.ts

import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'
import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'stream'
import { Logger } from '../../utils/logger'

const logger = Logger.child({ module: 'thumbhash' })

export class ThumbHashGenerator {

  /**
   * Generate ThumbHash for any visual attachment.
   * Returns base64-encoded hash string (~33 chars) or null if not visual.
   */
  static async generate(filePath: string, mimeType: string): Promise<string | null> {
    try {
      if (mimeType.startsWith('image/')) {
        return await this.fromImage(filePath)
      }
      if (mimeType.startsWith('video/')) {
        return await this.fromVideo(filePath)
      }
      if (mimeType === 'application/pdf') {
        return await this.fromPDF(filePath)
      }
      // Documents sans preview visuelle: pas de thumbhash
      return null
    } catch (error) {
      logger.warn({ error, filePath, mimeType }, 'ThumbHash generation failed')
      return null
    }
  }

  /**
   * Image (JPEG, PNG, WebP, GIF — first frame for GIF)
   */
  private static async fromImage(filePath: string): Promise<string> {
    const { data, info } = await sharp(filePath, { animated: false })
      .resize(100, 100, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
    return Buffer.from(hash).toString('base64')
  }

  /**
   * Video (MP4, MOV, WebM — extract frame at 0.5s or first frame)
   */
  private static async fromVideo(filePath: string): Promise<string> {
    const frameBuffer = await this.extractVideoFrame(filePath)
    const { data, info } = await sharp(frameBuffer)
      .resize(100, 100, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
    return Buffer.from(hash).toString('base64')
  }

  /**
   * PDF — render page 1 as image
   */
  private static async fromPDF(filePath: string): Promise<string | null> {
    // Utilise pdf2pic ou poppler si disponible
    // Sinon, retourne un placeholder generique pour PDF
    try {
      const { fromPath } = await import('pdf2pic')
      const converter = fromPath(filePath, {
        density: 72,
        format: 'png',
        width: 200,
        height: 200,
      })
      const result = await converter(1) // Page 1
      if (!result.buffer) return null

      const { data, info } = await sharp(result.buffer)
        .resize(100, 100, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const hash = rgbaToThumbHash(info.width, info.height, new Uint8Array(data))
      return Buffer.from(hash).toString('base64')
    } catch {
      return null // pdf2pic non disponible ou erreur
    }
  }

  /**
   * Extract a single frame from video using ffmpeg
   */
  private static extractVideoFrame(videoPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = new PassThrough()

      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)

      ffmpeg(videoPath)
        .seekInput(0.5)              // 0.5s in — skip black intro frames
        .frames(1)
        .outputFormat('image2pipe')
        .outputOptions('-vcodec', 'png')
        .on('error', (err) => {
          // Fallback: try frame 0
          const fallbackChunks: Buffer[] = []
          const fallbackStream = new PassThrough()
          fallbackStream.on('data', chunk => fallbackChunks.push(chunk))
          fallbackStream.on('end', () => resolve(Buffer.concat(fallbackChunks)))
          fallbackStream.on('error', reject)

          ffmpeg(videoPath)
            .seekInput(0)
            .frames(1)
            .outputFormat('image2pipe')
            .outputOptions('-vcodec', 'png')
            .pipe(fallbackStream, { end: true })
        })
        .pipe(stream, { end: true })
    })
  }
}
```

### Phase 2 : Integration dans UploadProcessor

```typescript
// services/gateway/src/services/attachments/UploadProcessor.ts
// Apres la ligne ~325 (apres extractMetadata et generateThumbnail)

import { ThumbHashGenerator } from './ThumbHashGenerator'

// Dans uploadFile(), apres:
//   const metadata = await MetadataManager.extractMetadata(...)
//   const thumbnailResult = await MetadataManager.generateThumbnail(...)
// Ajouter:

const thumbHash = await ThumbHashGenerator.generate(filePath, mimeType)

// Puis dans le Prisma create (ligne ~341-367), ajouter:
const attachment = await prisma.messageAttachment.create({
  data: {
    // ... champs existants ...
    thumbHash,  // ← NOUVEAU (String? nullable)
  }
})
```

### Phase 3 : Schema Prisma

```prisma
// packages/shared/prisma/schema.prisma
// Dans model MessageAttachment, apres thumbnailUrl:

model MessageAttachment {
  // ... champs existants ...
  thumbnailPath    String?
  thumbnailUrl     String?
  thumbHash        String?    // ThumbHash base64 (~33 chars) pour placeholder instantane
  // ... suite ...
}
```

Migration:
```bash
cd packages/shared && npx prisma db push
# OU pour production:
npx prisma migrate dev --name add-thumbhash
```

### Phase 4 : API Schema

```typescript
// packages/shared/types/api-schemas.ts
// Dans messageAttachmentSchema, ajouter:

export const messageAttachmentSchema = z.object({
  // ... champs existants ...
  thumbnailUrl: z.string().nullable().optional(),
  thumbHash: z.string().nullable().optional(),  // ← NOUVEAU
  // ... suite ...
})
```

### Phase 5 : iOS SDK — ThumbHash decoder

Vendor le fichier reference depuis https://github.com/evanw/thumbhash/blob/main/thumbhash.swift dans le SDK, puis ajouter une extension UIImage:

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift
//
// Contenu: copier thumbhash.swift depuis le repo officiel (~200 lignes)
// + ajouter l'extension ci-dessous a la fin:

extension UIImage {
    /// Decode a base64-encoded ThumbHash string to a UIImage placeholder.
    /// Returns nil if the string is invalid. Decode time: < 1ms.
    static func fromThumbHash(_ base64String: String) -> UIImage? {
        guard let data = Data(base64Encoded: base64String) else { return nil }
        let hash = [UInt8](data)
        guard hash.count >= 5 else { return nil }
        let (w, h, rgba) = thumbHashToRGBA(hash: hash)
        guard w > 0, h > 0, rgba.count == w * h * 4 else { return nil }

        let rgbaData = Data(rgba)
        guard let provider = CGDataProvider(data: rgbaData as CFData) else { return nil }
        guard let cgImage = CGImage(
            width: w,
            height: h,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: w * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        ) else { return nil }

        return UIImage(cgImage: cgImage)
    }
}
```

### Phase 6 : iOS SDK — Models

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
// APIMessageAttachment — ajouter:
public let thumbHash: String?

// packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift
// MeeshyMessageAttachment — ajouter:
public var thumbHash: String?

// packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift
// FeedMedia — ajouter:
public let thumbHash: String?
```

### Phase 7 : iOS SDK — ProgressiveCachedImage avec ThumbHash

```swift
// packages/MeeshyUI/Primitives/CachedAsyncImage.swift
// ProgressiveCachedImage — transformer en 3 tiers:

public struct ProgressiveCachedImage<Placeholder: View>: View {
    public let thumbHash: String?     // ← NOUVEAU: tier 0
    public let thumbnailUrl: String?  // tier 1
    public let fullUrl: String?       // tier 2
    public let placeholder: () -> Placeholder

    @State private var thumbHashImage: UIImage?   // ← NOUVEAU
    @State private var thumbnailImage: UIImage?
    @State private var fullImage: UIImage?

    public init(
        thumbHash: String? = nil,     // ← NOUVEAU parametre
        thumbnailUrl: String?,
        fullUrl: String?,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.thumbHash = thumbHash
        self.thumbnailUrl = thumbnailUrl
        self.fullUrl = fullUrl
        self.placeholder = placeholder

        // Tier 2: check disk cache for full image (sync, instant)
        let cachedFull: UIImage?
        if let fullUrl, !fullUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
            cachedFull = DiskCacheStore.cachedImage(for: resolved)
        } else {
            cachedFull = nil
        }
        _fullImage = State(initialValue: cachedFull)

        // Tier 1: check disk cache for thumbnail (only if full not cached)
        if cachedFull == nil, let thumbnailUrl, !thumbnailUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
            _thumbnailImage = State(initialValue: DiskCacheStore.cachedImage(for: resolved))
        }

        // Tier 0: decode ThumbHash (< 0.1ms, always available)
        if cachedFull == nil, let thumbHash, !thumbHash.isEmpty {
            _thumbHashImage = State(initialValue: UIImage.fromThumbHash(thumbHash))
        }
    }

    public var body: some View {
        ZStack {
            if let fullImage {
                Image(uiImage: fullImage).resizable().transition(.opacity)
            } else if let thumbnailImage {
                Image(uiImage: thumbnailImage).resizable().transition(.opacity)
            } else if let thumbHashImage {
                // ThumbHash placeholder — flou colore fidele, scale up
                Image(uiImage: thumbHashImage).resizable().interpolation(.low).transition(.opacity)
            } else {
                placeholder()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: fullImage != nil)
        .animation(.easeInOut(duration: 0.15), value: thumbnailImage != nil)
        .task(id: thumbnailUrl) {
            guard fullImage == nil else { return }
            await loadThumbnail()
        }
        .task(id: fullUrl) {
            await loadFullImage()
        }
    }

    // loadThumbnail() et loadFullImage() restent identiques
}
```

### Phase 8 : iOS App — Passer thumbHash dans les vues

```swift
// FeedPostCard+Media.swift — imageMediaView / galleryImageView
ProgressiveCachedImage(
    thumbHash: media.thumbHash,        // ← NOUVEAU
    thumbnailUrl: media.thumbnailUrl,
    fullUrl: media.url
) { Color(hex: media.thumbnailColor).shimmer() }

// ThemedMessageBubble+Media.swift — image attachments
ProgressiveCachedImage(
    thumbHash: attachment.thumbHash,    // ← NOUVEAU
    thumbnailUrl: attachment.thumbnailUrl,
    fullUrl: attachment.fileUrl
) { Color(hex: attachment.thumbnailColor).shimmer() }

// InlineVideoPlayerView.swift — video thumbnail layer
if let thumbHash = attachment.thumbHash {
    Image(uiImage: UIImage.fromThumbHash(thumbHash) ?? UIImage())
        .resizable().interpolation(.low)
} else {
    CachedAsyncImage(url: thumbUrl) { ... }
}
```

---

## 5. Backfill des attachments existants

Les attachments deja uploades n'ont pas de thumbHash. Script de migration:

```typescript
// scripts/backfill-thumbhash.ts

import { prisma } from '@meeshy/shared'
import { ThumbHashGenerator } from '../services/gateway/src/services/attachments/ThumbHashGenerator'

async function backfill() {
  const batchSize = 100
  let cursor: string | undefined

  while (true) {
    const attachments = await prisma.messageAttachment.findMany({
      where: {
        thumbHash: null,
        mimeType: { startsWith: 'image/' }  // Commencer par les images
      },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, filePath: true, mimeType: true }
    })

    if (attachments.length === 0) break

    for (const att of attachments) {
      const thumbHash = await ThumbHashGenerator.generate(att.filePath, att.mimeType)
      if (thumbHash) {
        await prisma.messageAttachment.update({
          where: { id: att.id },
          data: { thumbHash }
        })
      }
    }

    cursor = attachments[attachments.length - 1].id
    console.log(`Processed ${attachments.length} attachments (cursor: ${cursor})`)
  }
}

// Ensuite backfill videos, puis PDFs
```

---

## 6. Types d'attachments couverts

| Type MIME | Methode | ThumbHash | Temps serveur |
|---|---|---|---|
| `image/jpeg` | sharp direct | Oui | ~6-15ms |
| `image/png` | sharp direct | Oui (avec alpha) | ~6-15ms |
| `image/webp` | sharp direct | Oui | ~6-15ms |
| `image/gif` | sharp (frame 1) | Oui | ~6-15ms |
| `image/svg+xml` | sharp (rasterize) | Oui | ~10-20ms |
| `image/heic` | sharp (si libvips supporte) | Oui | ~10-20ms |
| `video/mp4` | ffmpeg frame → sharp | Oui | ~50-200ms |
| `video/quicktime` | ffmpeg frame → sharp | Oui | ~50-200ms |
| `video/webm` | ffmpeg frame → sharp | Oui | ~50-200ms |
| `application/pdf` | pdf2pic page 1 → sharp | Oui | ~100-300ms |
| `audio/*` | Non applicable | Non | — |
| `application/x-location` | Non applicable | Non | — |
| `text/*`, `application/json`, etc. | Non applicable | Non | — |

---

## 7. Fallback chain cote iOS

```
Affichage d'un media:

1. ThumbHash (thumbHash != nil)
   → UIImage.fromThumbHash() en 0.1ms
   → Image floue coloree fidele (32x32 upscaled)
   → TOUJOURS disponible si le serveur l'a calcule

2. Thumbnail (thumbnailUrl != nil ET cache hit)
   → DiskCacheStore.cachedImage() sync
   → Image basse-res nette
   → Disponible si prefetch a eu le temps

3. Full image (fullUrl cache hit)
   → DiskCacheStore.cachedImage() sync
   → Image pleine resolution
   → Disponible si deja vu ou prefetch termine

4. Placeholder fallback (rien de disponible)
   → Color(hex: thumbnailColor).shimmer()
   → Couleur unie avec shimmer (dernier recours)

Transitions:
  thumbHash → thumbnail : fade 0.15s
  thumbnail → full      : fade 0.25s
  thumbHash → full      : fade 0.25s (skip thumbnail si full arrive d'abord)
```

---

## 8. Metriques attendues

| Metrique | Avant | Apres ThumbHash |
|---|---|---|
| Temps avant 1er pixel visuel | 300-800ms (attente reseau) | **< 1ms** (decode local) |
| Pourcentage d'ecrans vides | ~40% (cold cache) | **0%** |
| Taille supplementaire par attachment | 0 | +33 chars base64 (~44 bytes) |
| Cout serveur par upload | 0 | +6-200ms (selon type) |
| Memoire iOS par placeholder | ~0 (shimmer) | ~4-8KB (UIImage 32x32) |
| Stockage MongoDB par attachment | 0 | +44 bytes |

---

## 9. Ordre d'execution

| Etape | Quoi | Ou | Prerequis | Effort |
|---|---|---|---|---|
| **1** | Ajouter `thumbHash String?` au schema Prisma | `packages/shared/prisma/schema.prisma` | — | 5 min |
| **2** | Migration DB | `npx prisma db push` | Etape 1 | 2 min |
| **3** | Creer ThumbHashGenerator | `services/gateway/src/services/attachments/` | `npm i thumbhash` | 2h |
| **4** | Integrer dans UploadProcessor | `UploadProcessor.ts` | Etape 3 | 30 min |
| **5** | Ajouter thumbHash a api-schemas | `packages/shared/types/api-schemas.ts` | Etape 1 | 5 min |
| **6** | Ajouter select thumbHash dans les requetes | `MessageProcessor.ts`, `PostService.ts` | Etape 5 | 30 min |
| **7** | Vendor thumbhash.swift + UIImage extension | `MeeshySDK/Sources/MeeshySDK/Utils/` | — | 30 min |
| **8** | Ajouter `thumbHash` aux 3 models iOS | `MessageModels.swift`, `CoreModels.swift`, `FeedModels.swift` | Etape 7 | 20 min |
| **9** | Modifier ProgressiveCachedImage (tier 0) | `CachedAsyncImage.swift` | Etape 8 | 1h |
| **10** | Passer thumbHash dans les vues (feed, messages, stories) | `FeedPostCard+Media.swift`, `ThemedMessageBubble+Media.swift` | Etape 9 | 1h |
| **11** | Backfill script pour attachments existants | `scripts/backfill-thumbhash.ts` | Etapes 1-3 | 1h |
| **12** | Deployer gateway + lancer backfill | Production | Etapes 1-6, 11 | 30 min |
| **TOTAL** | | | | **~8h** |
