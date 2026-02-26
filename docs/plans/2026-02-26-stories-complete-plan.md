# Stories Complètes — Plan d'Implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cycle de vie complet des stories — rendu pixel-perfect, son d'arrière-plan (bibliothèque + enregistrement + réutilisation), audio vocal transcrit/traduit, traduction automatique du texte (Prisme).

**Architecture:** Phase 1 étend les modèles SDK (fondation partagée). Phase 2 lance 3 agents parallèles en worktrees isolés (gateway-audio, ios-viewer, ios-composer). Phase 3 intègre et vérifie.

**Tech Stack:** Swift 5.9 / SwiftUI / MeeshySDK (SPM), TypeScript 5.9 / Fastify 5 / Prisma / ZeroMQ, NLLB-200 / Whisper (translator), AVFoundation (iOS audio)

**Design doc:** `docs/plans/2026-02-26-stories-complete-design.md`

---

## PHASE 1 — SDK Models (séquentiel, fondation)

### Task 1: Étendre StoryEffects + ajouter types audio

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

**Contexte:** `StoryEffects` a déjà `musicTrackId/Start/End`. On remplace la logique musik mockée par un vrai `backgroundAudioId` référençant la DB, et on ajoute le support vocal.

**Step 1: Ajouter `StoryVoiceTranscription`**

Après le bloc `// MARK: - Story Sticker`, insérer :

```swift
// MARK: - Story Voice Transcription

public struct StoryVoiceTranscription: Codable, Sendable {
    public let language: String
    public let content: String

    public init(language: String, content: String) {
        self.language = language
        self.content = content
    }
}
```

**Step 2: Ajouter `StoryBackgroundAudioEntry`**

```swift
// MARK: - Story Background Audio Entry

public struct StoryBackgroundAudioEntry: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let uploaderName: String?
    public let duration: Int        // secondes
    public let fileUrl: String
    public let usageCount: Int
    public let isPublic: Bool

    public init(id: String, title: String, uploaderName: String? = nil,
                duration: Int, fileUrl: String, usageCount: Int = 0, isPublic: Bool = true) {
        self.id = id; self.title = title; self.uploaderName = uploaderName
        self.duration = duration; self.fileUrl = fileUrl
        self.usageCount = usageCount; self.isPublic = isPublic
    }
}
```

**Step 3: Étendre `StoryEffects`**

Remplacer les champs `musicTrackId/musicStartTime/musicEndTime` par :

```swift
// Audio d'arrière-plan (bibliothèque ou enregistrement)
public var backgroundAudioId: String?
public var backgroundAudioVolume: Float?
public var backgroundAudioStart: TimeInterval?

// Audio vocal (transcrit + traduit par le pipeline Whisper/NLLB)
public var voiceAttachmentId: String?
public var voiceTranscriptions: [StoryVoiceTranscription]?
```

Mettre à jour `init()`, `CodingKeys`, `encode(to:)`, `init(from:)` en conséquence. Conserver `musicTrackId/musicStartTime/musicEndTime` comme `@available(*, deprecated)` pour compatibilité ascendante.

**Step 4: Étendre `StoryItem`**

Ajouter les champs de traduction pour le Prisme :

```swift
public let translations: [StoryTranslation]?
public let backgroundAudio: StoryBackgroundAudioEntry?

public struct StoryTranslation: Codable, Sendable {
    public let language: String
    public let content: String
}
```

Ajouter `resolvedContent(preferredLanguage: String?) -> String?` sur `StoryItem` :

```swift
public func resolvedContent(preferredLanguage: String?) -> String? {
    guard let lang = preferredLanguage,
          let translations = translations,
          !translations.isEmpty else { return content }
    return translations.first { $0.language == lang }?.content ?? content
}
```

**Step 5: Mettre à jour `toStoryGroups()` extension**

Dans la conversion `APIPost → StoryItem`, mapper `post.storyEffects` pour extraire `voiceTranscriptions` et `backgroundAudio` si présents dans le JSON.

**Step 6: Build check**

```bash
cd /Users/smpceo/Documents/v2_meeshy
swift build --package-path packages/MeeshySDK 2>&1 | grep -E "error:|warning:" | head -20
```

Expected: zéro erreur. Warnings OK.

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): extend StoryEffects with background audio + voice transcription models"
```

---

## PHASE 2a — Gateway Audio (worktree `feat/stories-gateway-audio`)

> **Agent gateway-audio** : travaille dans le worktree `../v2_meeshy-feat-stories-gateway-audio`
> Ne touche PAS aux fichiers iOS ni au SDK Swift.

### Task 2: Modèle Prisma StoryBackgroundAudio

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

**Step 1: Ajouter le modèle après le modèle Post**

```prisma
/// Bibliothèque de sons d'arrière-plan pour les stories
model StoryBackgroundAudio {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  uploaderId  String   @db.ObjectId
  uploader    User     @relation("StoryAudioUploads", fields: [uploaderId], references: [id])
  fileUrl     String
  title       String
  duration    Int      // secondes
  usageCount  Int      @default(0)
  isPublic    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([usageCount])
  @@index([uploaderId])
}
```

Ajouter sur le modèle `User` :
```prisma
storyAudioUploads  StoryBackgroundAudio[] @relation("StoryAudioUploads")
```

**Step 2: Régénérer le client Prisma**

```bash
cd /Users/smpceo/Documents/v2_meeshy
npx prisma generate --schema=packages/shared/prisma/schema.prisma
```

Expected: "Generated Prisma Client"

**Step 3: Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/client/
git commit -m "feat(schema): add StoryBackgroundAudio model for story audio library"
```

---

### Task 3: Endpoints upload/list sons

**Files:**
- Create: `services/gateway/src/routes/posts/audio.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/meeshy-uploads';
const MAX_AUDIO_DURATION_SEC = 60;
const ALLOWED_MIME = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac']);

const ListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export function registerStoryAudioRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // POST /stories/audio — Upload d'un son
  fastify.post('/stories/audio', {
    preValidation: [requiredAuth],
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ success: false, error: 'No file provided' });
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return reply.status(400).send({ success: false, error: 'Invalid audio format' });
    }

    const title = (data.fields['title'] as any)?.value ?? 'Son sans titre';
    const isPublic = (data.fields['isPublic'] as any)?.value !== 'false';
    const durationRaw = parseInt((data.fields['duration'] as any)?.value ?? '0', 10);
    const duration = isNaN(durationRaw) ? 0 : Math.min(durationRaw, MAX_AUDIO_DURATION_SEC);

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(data.filename) || '.m4a';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, await data.toBuffer());

    const fileUrl = `/api/v1/static/${filename}`;
    const audio = await prisma.storyBackgroundAudio.create({
      data: {
        uploaderId: authContext.registeredUser.id,
        fileUrl,
        title: title.slice(0, 100),
        duration,
        isPublic,
      },
    });

    return reply.status(201).send({ success: true, data: audio });
  });

  // GET /stories/audio — Liste bibliothèque publique
  fastify.get('/stories/audio', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof ListQuerySchema> }>, reply: FastifyReply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid query' });

    const { q, limit } = parsed.data;
    const where: any = { isPublic: true };
    if (q) where.title = { contains: q, mode: 'insensitive' };

    const audios = await prisma.storyBackgroundAudio.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit,
      include: { uploader: { select: { username: true } } },
    });

    return reply.send({ success: true, data: audios });
  });

  // POST /stories/audio/:audioId/use — Incrémenter usageCount
  fastify.post<{ Params: { audioId: string } }>('/stories/audio/:audioId/use', {
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    const { audioId } = request.params;
    await prisma.storyBackgroundAudio.update({
      where: { id: audioId },
      data: { usageCount: { increment: 1 } },
    }).catch(() => null);
    return reply.send({ success: true });
  });
}
```

**Step 4: Enregistrer dans l'index des routes posts**

Modify: `services/gateway/src/routes/posts/index.ts`

Ajouter l'import + l'appel :
```typescript
import { registerStoryAudioRoutes } from './audio';
// dans la fonction principale :
registerStoryAudioRoutes(fastify, prisma, requiredAuth);
```

**Step 5: Build check**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npx tsc --noEmit 2>&1 | head -30
```

Expected: zéro erreur.

**Step 6: Commit**

```bash
git add services/gateway/src/routes/posts/audio.ts services/gateway/src/routes/posts/index.ts
git commit -m "feat(gateway): story audio library endpoints (upload, list, use)"
```

---

### Task 4: Traduction automatique des stories à la création

**Files:**
- Modify: `services/gateway/src/services/PostService.ts`

Localiser `createPost()`. Après la création du post en DB, si `type === 'STORY'` et `content` non vide, déclencher la traduction async :

**Step 1: Ajouter la méthode privée `triggerStoryTextTranslation`**

```typescript
private async triggerStoryTextTranslation(postId: string, content: string, authorId: string): Promise<void> {
  try {
    // Récupérer les langues cibles des contacts de l'auteur
    const contacts = await this.prisma.conversationMember.findMany({
      where: {
        conversation: { members: { some: { userId: authorId } } },
        userId: { not: authorId },
      },
      include: { user: { select: { systemLanguage: true } } },
      take: 100,
    });

    const languages = [...new Set(
      contacts
        .map(c => c.user.systemLanguage)
        .filter((l): l is string => !!l && l !== 'en')
    )].slice(0, 10);

    if (languages.length === 0) return;

    // Envoyer via ZMQ au translator (même format que les messages)
    const zmq = ZmqSingleton.getInstance();
    zmq.pushTranslationRequest({
      type: 'story_text',
      postId,
      content,
      targetLanguages: languages,
    });
  } catch (error) {
    // Silent — la traduction est best-effort
    this.logger.warn(`[StoryTranslation] Failed to trigger for post ${postId}: ${error}`);
  }
}
```

**Step 2: Appeler après création de STORY**

```typescript
if (data.type === 'STORY' && data.content) {
  this.triggerStoryTextTranslation(post.id, data.content, authorId).catch(() => {});
}
```

**Step 3: Gérer le résultat ZMQ (dans le handler ZMQ existant)**

Localiser le handler `translationCompleted` dans `ZmqTranslationService` ou `MeeshySocketIOManager`. Ajouter le cas `type === 'story_text'` qui met à jour `Post.translations` via prisma.

**Step 4: Build check + commit**

```bash
npx tsc --noEmit 2>&1 | head -20
git add services/gateway/src/services/PostService.ts
git commit -m "feat(gateway): trigger Prisme text translation on story creation"
```

---

## PHASE 2b — iOS Viewer Pixel-Perfect (worktree `feat/stories-ios-viewer`)

> **Agent ios-viewer** : travaille dans `../v2_meeshy-feat-stories-ios-viewer`
> Ne touche PAS aux fichiers du Composer ni aux fichiers gateway.

### Task 5: StoryCanvasReaderView (composant de rendu fidèle)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

```swift
import SwiftUI
import MeeshySDK

/// Reconstruit pixel-perfect le canvas d'une story dans le viewer.
/// Même rendu que StoryCanvasView (Composer) mais en lecture seule.
public struct StoryCanvasReaderView: View {
    public let story: StoryItem
    public let preferredLanguage: String?

    public init(story: StoryItem, preferredLanguage: String? = nil) {
        self.story = story
        self.preferredLanguage = preferredLanguage
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                backgroundLayer
                mediaLayer
                filterOverlay
                if let drawingData = story.storyEffects?.drawingData {
                    DrawingOverlayView(drawingData: .constant(drawingData), isActive: .constant(false))
                        .allowsHitTesting(false)
                }
                stickerLayer(size: geo.size)
                textLayer(size: geo.size)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Background

    private var backgroundLayer: some View {
        Group {
            if let bg = story.storyEffects?.background {
                if bg.hasPrefix("gradient:") {
                    let parts = bg.replacingOccurrences(of: "gradient:", with: "")
                        .split(separator: ",").map { String($0) }
                    LinearGradient(
                        colors: parts.map { Color(hex: $0) },
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                } else {
                    Color(hex: bg)
                }
            } else {
                LinearGradient(
                    colors: [Color(hex: "1A1A2E"), Color(hex: "16213E"), Color(hex: "0F3460")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Media

    @ViewBuilder
    private var mediaLayer: some View {
        if let media = story.media.first, let urlStr = media.url, let url = URL(string: urlStr) {
            let filtered = filteredImage(url: url)
            filtered
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        }
    }

    // Applique le filtre CI si nécessaire (même logique que StoryFilterProcessor)
    private func filteredImage(url: URL) -> Image {
        // KFImage would be ideal; for now use AsyncImage fallback
        // The caller (StoryViewerView) can pass a UIImage from cache
        return Image(systemName: "photo")  // placeholder — see Task 6 for full integration
    }

    // MARK: - Filter Overlay

    @ViewBuilder
    private var filterOverlay: some View {
        if let filterName = story.storyEffects?.parsedFilter {
            StoryFilterOverlayView(filter: filterName)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Text Layer (position exacte)

    @ViewBuilder
    private func textLayer(size: CGSize) -> some View {
        let content = story.resolvedContent(preferredLanguage: preferredLanguage)
        if let content = content, !content.isEmpty, let effects = story.storyEffects {
            let pos = effects.resolvedTextPosition
            let posX = pos.x * size.width
            let posY = pos.y * size.height

            styledText(content: content, effects: effects)
                .position(x: posX, y: posY)
        }
    }

    private func styledText(content: String, effects: StoryEffects) -> some View {
        let fontSize = effects.textSize ?? 28
        let colorHex = effects.textColor ?? "FFFFFF"
        let alignment: TextAlignment = {
            switch effects.textAlign {
            case "left":  return .leading
            case "right": return .trailing
            default:      return .center
            }
        }()
        let textStyle = effects.parsedTextStyle

        return Text(content)
            .font(storyFont(for: textStyle, size: fontSize))
            .foregroundColor(Color(hex: colorHex))
            .multilineTextAlignment(alignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if effects.textBg != nil {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: textStyle == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
            .frame(maxWidth: 280)
    }

    // MARK: - Sticker Layer (positions exactes)

    @ViewBuilder
    private func stickerLayer(size: CGSize) -> some View {
        if let stickers = story.storyEffects?.stickerObjects, !stickers.isEmpty {
            ForEach(stickers) { sticker in
                Text(sticker.emoji)
                    .font(.system(size: 50 * sticker.scale))
                    .rotationEffect(.degrees(sticker.rotation))
                    .position(
                        x: sticker.x * size.width,
                        y: sticker.y * size.height
                    )
                    .allowsHitTesting(false)
            }
        }
    }
}

// MARK: - Filter Overlay Helper

private struct StoryFilterOverlayView: View {
    let filter: StoryFilter

    var body: some View {
        switch filter {
        case .vintage:
            Color.orange.opacity(0.15).blendMode(.multiply)
        case .bw:
            Color.black.opacity(0.0)
                .background(.ultraThinMaterial.opacity(0))
                .colorMultiply(.gray)
        case .warm:
            Color.orange.opacity(0.08).blendMode(.softLight)
        case .cool:
            Color.blue.opacity(0.08).blendMode(.softLight)
        case .dramatic:
            Color.black.opacity(0.2).blendMode(.multiply)
        }
    }
}

// MARK: - Font helper (dupliqué du StoryCanvasView pour autonomie)

private func storyFont(for style: StoryTextStyle?, size: CGFloat) -> Font {
    switch style {
    case .bold:        return .system(size: size, weight: .black)
    case .neon:        return .system(size: size, weight: .semibold)
    case .typewriter:  return .custom("Courier", size: size)
    case .handwriting: return .custom("SnellRoundhand", size: size)
    case .classic:     return .custom("Georgia", size: size)
    case .none:        return .system(size: size, weight: .semibold)
    }
}
```

**Step 6: Commit**

```bash
cd ../v2_meeshy-feat-stories-ios-viewer
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk/ui): StoryCanvasReaderView - pixel-perfect canvas reconstruction"
```

---

### Task 6: Intégrer StoryCanvasReaderView dans StoryViewerView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`

Repérer la fonction `storyCard(geometry:)`. Remplacer les Layer 2 (media) + Layer 4 (texte+stickers) + Layer 3 (filter) par un seul `StoryCanvasReaderView` :

**Step 1: Remplacer les couches canvas**

Chercher le bloc commenté `// === Layer 2: Media` jusqu'à `// === Layer 5: Gradient scrims`. Remplacer par :

```swift
// === Layers 2-4: Canvas pixel-perfect (media + dessin + texte + stickers) ===
if let story = currentStory {
    StoryCanvasReaderView(
        story: story,
        preferredLanguage: resolvedViewerLanguage
    )
    .opacity(contentOpacity)
    .offset(y: textSlideOffset)
    // Outgoing cross-dissolve
    if let outgoing = outgoingStory, outgoingOpacity > 0 {
        StoryCanvasReaderView(story: outgoing, preferredLanguage: resolvedViewerLanguage)
            .opacity(outgoingOpacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
```

**Step 2: Ajouter la résolution de langue**

Dans `StoryViewerView`, ajouter :

```swift
private var resolvedViewerLanguage: String? {
    // Même logique que resolveUserLanguage() des messages
    let prefs = AuthManager.shared.currentUser
    if let custom = prefs?.customDestinationLanguage, prefs?.useCustomDestination == true {
        return custom
    }
    if prefs?.translateToSystemLanguage == true, let sys = prefs?.systemLanguage {
        return sys
    }
    return Locale.current.language.languageCode?.identifier
}
```

**Step 3: Ajouter l'indicateur de traduction**

Dans le body, après `storyHeader`, ajouter en overlay discret si traduction active :

```swift
if let story = currentStory,
   let lang = resolvedViewerLanguage,
   story.resolvedContent(preferredLanguage: lang) != story.content {
    translationIndicator
}
```

```swift
private var translationIndicator: some View {
    HStack(spacing: 4) {
        Image(systemName: "translate")
            .font(.system(size: 11, weight: .medium))
        Text(resolvedViewerLanguage?.uppercased() ?? "")
            .font(.system(size: 10, weight: .semibold))
    }
    .foregroundColor(.white.opacity(0.75))
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(Capsule().fill(Color.black.opacity(0.35)))
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.leading, 16)
    .padding(.top, 8)
    .allowsHitTesting(false)
}
```

**Step 4: Build check**

```bash
cd ../v2_meeshy-feat-stories-ios-viewer
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): story viewer pixel-perfect canvas + Prisme translation indicator"
```

---

### Task 7: Indicateur audio de fond + Prisme Vocal dans le Viewer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`

**Step 1: Ajouter l'état AVAudioPlayer**

Dans `StoryViewerView`, ajouter :

```swift
@State private var backgroundAudioPlayer: AVAudioPlayer?
@State private var voiceAudioPlayer: AVAudioPlayer?
@State private var showAudioInfo = false
```

**Step 2: Lancer l'audio de fond quand la story change**

Dans la fonction `startTimer()` ou `markCurrentViewed()` :

```swift
private func startBackgroundAudio() {
    backgroundAudioPlayer?.stop()
    guard let story = currentStory,
          let audioId = story.storyEffects?.backgroundAudioId,
          let urlStr = resolvedAudioURL(audioId: audioId),
          let url = URL(string: urlStr) else { return }
    let volume = story.storyEffects?.backgroundAudioVolume ?? 0.7
    let start = story.storyEffects?.backgroundAudioStart ?? 0
    Task {
        let data = try? await URLSession.shared.data(from: url).0
        guard let data else { return }
        await MainActor.run {
            backgroundAudioPlayer = try? AVAudioPlayer(data: data)
            backgroundAudioPlayer?.volume = Float(volume)
            backgroundAudioPlayer?.currentTime = start
            backgroundAudioPlayer?.play()
        }
    }
}
```

**Step 3: Indicateur waveform animé (bottom-left)**

Insérer dans `storyCard(geometry:)` avant le Layer 9 :

```swift
// === Layer 8.5: Indicateur son de fond ===
if currentStory?.storyEffects?.backgroundAudioId != nil {
    backgroundAudioBadge
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .padding(.leading, 16)
        .padding(.bottom, geometry.safeAreaInsets.bottom + 100)
        .allowsHitTesting(true)
}
```

```swift
private var backgroundAudioBadge: some View {
    Button {
        showAudioInfo = true
    } label: {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(.system(size: 11, weight: .semibold))
            if let title = currentStory?.backgroundAudio?.title {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.black.opacity(0.5)))
    }
    .sheet(isPresented: $showAudioInfo) {
        backgroundAudioInfoSheet
    }
}

private var backgroundAudioInfoSheet: some View {
    VStack(spacing: 20) {
        if let audio = currentStory?.backgroundAudio {
            VStack(spacing: 8) {
                Image(systemName: "music.note.list")
                    .font(.system(size: 40))
                    .foregroundColor(MeeshyColors.pink)
                Text(audio.title)
                    .font(.headline)
                if let uploader = audio.uploaderName {
                    Text("Son original de @\(uploader)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Button {
                showAudioInfo = false
                // Ouvrir le composer pré-rempli avec ce son
                NotificationCenter.default.post(
                    name: .storyCreateWithAudio,
                    object: nil,
                    userInfo: ["audioId": audio.id, "audioTitle": audio.title]
                )
            } label: {
                Label("Créer une story avec ce son", systemImage: "camera.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        LinearGradient(
                            colors: [MeeshyColors.pink, MeeshyColors.cyan],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    )
            }
        }
        Spacer()
    }
    .padding(24)
    .presentationDetents([.medium])
}
```

**Step 4: Extension Notification.Name**

```swift
extension Notification.Name {
    static let storyCreateWithAudio = Notification.Name("storyCreateWithAudio")
}
```

**Step 5: Caption vocal (transcription overlay)**

Si `story.storyEffects?.voiceTranscriptions` contient une traduction pour la langue du viewer, afficher en overlay caption :

```swift
@ViewBuilder
private var voiceCaptionOverlay: some View {
    if let lang = resolvedViewerLanguage,
       let transcription = currentStory?.storyEffects?.voiceTranscriptions?
           .first(where: { $0.language == lang })
           ?? currentStory?.storyEffects?.voiceTranscriptions?.first {
        Text(transcription.content)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.black.opacity(0.6))
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, 160)
            .allowsHitTesting(false)
    }
}
```

**Step 6: Build + commit**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "feat(ios): background audio playback + vocal caption overlay in story viewer"
```

---

## PHASE 2c — iOS Composer Épuré (worktree `feat/stories-ios-composer`)

> **Agent ios-composer** : travaille dans `../v2_meeshy-feat-stories-ios-composer`
> Ne touche PAS aux fichiers du Viewer ni aux fichiers gateway.

### Task 8: StoryAudioPanel (remplace StoryMusicPicker)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMusicPicker.swift` (à la fin)

Le fichier complet `StoryAudioPanel.swift` doit implémenter :

**Structure d'état :**
```swift
public enum StoryAudioTab { case library, record, mine }

public struct StoryAudioPanel: View {
    @Binding public var selectedAudioId: String?
    @Binding public var selectedAudioTitle: String?
    @Binding public var volume: Float
    @Binding public var trimStart: TimeInterval

    @State private var activeTab: StoryAudioTab = .library
    @State private var libraryItems: [StoryBackgroundAudioEntry] = []
    @State private var searchText = ""
    @State private var isRecording = false
    @State private var recordedDuration: TimeInterval = 0
    @State private var shareRecording = false
    @State private var isLoadingLibrary = false
    @State private var previewPlayer: AVAudioPlayer?

    // ...
}
```

**Onglet Bibliothèque** : charge `GET /stories/audio?q=`, liste avec nom + créateur + durée + usageCount. Tap pour sélectionner/désélectionner. Play preview au tap sur l'icône lecture.

**Onglet Enregistrer** : bouton hold-to-record avec waveform animé pendant l'enregistrement. Timer visible. Toggle "Partager ce son" (isPublic). À la fin de l'enregistrement : waveform preview + play + discard.

**Onglet Mes sons** : liste `GET /stories/audio?uploaderId=me` (filtrer côté client).

**Volume + trim** (commun, apparaît quand un son est sélectionné) :
```swift
private var volumeTrimControls: some View {
    VStack(spacing: 8) {
        // Volume
        HStack {
            Image(systemName: "speaker.fill").font(.system(size: 12))
            Slider(value: $volume, in: 0...1)
            Image(systemName: "speaker.wave.3.fill").font(.system(size: 12))
        }
        .foregroundColor(.white.opacity(0.7))
        .padding(.horizontal, 16)
    }
    .padding(.vertical, 8)
    .background(Color.white.opacity(0.05))
}
```

**Step 1: Build check**

```bash
swift build --package-path packages/MeeshySDK 2>&1 | grep -E "error:" | head -10
```

**Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift
git commit -m "feat(sdk/ui): StoryAudioPanel - library/record/mine tabs with volume control"
```

---

### Task 9: StoryVoiceRecorder

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift`

Composant standalone déclenché depuis la toolbar :
- Tap : ouvre le panel de recording
- Press-hold directement : démarre l'enregistrement immédiatement

```swift
public struct StoryVoiceRecorder: View {
    @Binding public var voiceAudioData: Data?
    @Binding public var isRecording: Bool
    @State private var recorder: AVAudioRecorder?
    @State private var audioLevel: Float = 0
    @State private var duration: TimeInterval = 0
    @State private var timer: Timer?
    @State private var hasRecording = false
    @State private var previewPlayer: AVAudioPlayer?

    // Waveform animée 5 barres
    // Hold-to-record gesture
    // Discard (x) + confirm (checkmark)
    // Max 60s
}
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift
git commit -m "feat(sdk/ui): StoryVoiceRecorder - hold-to-record with waveform preview"
```

---

### Task 10: Refonte toolbar StoryComposerView (5 boutons, panels contextuels)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Step 1: Étendre `StoryComposerPanel`**

Remplacer l'enum par :
```swift
public enum StoryComposerPanel: Equatable {
    case none
    case text
    case effects    // Stickers + Dessin + Filtres + Fond
    case audio      // Son d'arrière-plan
    case voice      // Enregistrement vocal
}

// Sous-panel pour Effects
public enum StoryEffectsSubPanel: Equatable {
    case stickers, drawing, filter, background
}
```

**Step 2: Nouveaux états**

```swift
@State private var activeEffectsSubPanel: StoryEffectsSubPanel? = nil

// Audio d'arrière-plan (remplace musicTrack)
@State private var selectedAudioId: String? = nil
@State private var selectedAudioTitle: String? = nil
@State private var audioVolume: Float = 0.7
@State private var audioTrimStart: TimeInterval = 0

// Voix
@State private var voiceAudioData: Data? = nil
@State private var isVoiceRecording = false
```

**Step 3: Nouvelle `toolBar` (5 boutons)**

```swift
private var toolBar: some View {
    HStack(spacing: 0) {
        toolButton(icon: "photo.on.rectangle", label: "Média", action: { showPhotoPicker = true })
        toolButton(icon: "textformat", label: "Texte", panel: .text)
        toolButton(icon: "sparkles", label: "Effets", panel: .effects)
        toolButton(icon: "music.note", label: "Son", panel: .audio)
        voiceToolButton
    }
    .padding(.vertical, 8)
    .background(Color.black.opacity(0.3))
}
```

**Step 4: Panel Effets (révèle une grille secondaire)**

```swift
private var effectsSecondaryPanel: some View {
    HStack(spacing: 16) {
        effectsSubButton(icon: "face.smiling", label: "Stickers", sub: .stickers)
        effectsSubButton(icon: "pencil.tip", label: "Dessin", sub: .drawing)
        effectsSubButton(icon: "camera.filters", label: "Filtres", sub: .filter)
        effectsSubButton(icon: "paintpalette", label: "Fond", sub: .background)
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 20)
    .background(Color.black.opacity(0.4))
    .transition(.move(edge: .bottom).combined(with: .opacity))
}
```

**Step 5: `activeToolPanel` mis à jour**

```swift
@ViewBuilder
private var activeToolPanel: some View {
    switch activePanel {
    case .text:
        StoryTextEditorView(...)
    case .effects:
        VStack(spacing: 0) {
            effectsSecondaryPanel
            if let sub = activeEffectsSubPanel {
                effectsSubPanelContent(sub)
            }
        }
    case .audio:
        StoryAudioPanel(
            selectedAudioId: $selectedAudioId,
            selectedAudioTitle: $selectedAudioTitle,
            volume: $audioVolume,
            trimStart: $audioTrimStart
        )
        .frame(height: 360)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    case .voice:
        StoryVoiceRecorder(voiceAudioData: $voiceAudioData, isRecording: $isVoiceRecording)
            .frame(height: 200)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    case .none:
        EmptyView()
    }
}
```

**Step 6: Mettre à jour `buildEffects()` + `publishStory()`**

```swift
private func buildEffects() -> StoryEffects {
    let bgHex = selectedImage != nil ? nil : colorToHex(backgroundColor)
    return StoryEffects(
        background: bgHex,
        textStyle: textStyle.rawValue,
        textColor: colorToHex(textColor),
        filter: selectedFilter?.rawValue,
        textAlign: alignmentString(textAlignment),
        textSize: textSize,
        textBg: textBgEnabled ? "000000" : nil,
        stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
        textPositionPoint: textPosition,
        drawingData: drawingData,
        backgroundAudioId: selectedAudioId,
        backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
        backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil
        // voiceAttachmentId rempli après upload dans publishStory()
    )
}
```

`publishStory()` : si `voiceAudioData != nil`, uploader en premier via `POST /attachments` (même endpoint que les audio messages), récupérer l'attachment ID, puis passer dans `storyEffects.voiceAttachmentId`.

**Step 7: Gérer la notification `.storyCreateWithAudio` dans StoryTrayView**

Dans `StoryTrayView`, observer la notification et ouvrir le Composer avec `preloadedAudioId` :

```swift
.onReceive(NotificationCenter.default.publisher(for: .storyCreateWithAudio)) { note in
    if let audioId = note.userInfo?["audioId"] as? String {
        viewModel.preloadedAudioId = audioId
        viewModel.preloadedAudioTitle = note.userInfo?["audioTitle"] as? String
        viewModel.showStoryComposer = true
    }
}
```

Adapter `StoryComposerView` pour accepter `preloadedAudioId` en paramètre d'init.

**Step 8: Build check**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`

**Step 9: Commit final phase 2c**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift
git rm packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMusicPicker.swift
git commit -m "feat(ios): story composer rework - 5-button toolbar, audio panel, voice recorder"
```

---

## PHASE 3 — Intégration finale

### Task 11: Merge des worktrees + clean build

**Step 1: Merger dans l'ordre (viewer d'abord, puis composer)**

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Merger ios-viewer
git merge feat/stories-ios-viewer --no-ff -m "merge: story viewer pixel-perfect + Prisme vocal"

# Merger ios-composer
git merge feat/stories-ios-composer --no-ff -m "merge: story composer épuré + audio panel"

# Merger gateway-audio
git merge feat/stories-gateway-audio --no-ff -m "merge: story gateway audio endpoints + Prisme"
```

**Step 2: Clean build**

```bash
./apps/ios/meeshy.sh clean --deep
./apps/ios/meeshy.sh build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`

**Step 3: Nettoyage worktrees**

```bash
git worktree remove ../v2_meeshy-feat-stories-ios-viewer
git worktree remove ../v2_meeshy-feat-stories-ios-composer
git worktree remove ../v2_meeshy-feat-stories-gateway-audio
```

**Step 4: Lancer l'app et vérifier manuellement**

```bash
./apps/ios/meeshy.sh run
```

Checklist de vérification manuelle :
- [ ] Créer une story avec texte + stickers → positions fidèles dans le viewer
- [ ] Créer une story avec dessin → overlay visible dans le viewer
- [ ] Sélectionner un son depuis la bibliothèque → waveform animée dans le viewer
- [ ] Tap sur waveform → sheet "Créer avec ce son"
- [ ] Enregistrer un son → toggle "Partager" → publier → visible dans la bibliothèque
- [ ] Enregistrer un vocal → transcription visible en caption dans le viewer
- [ ] Texte story affiché dans la langue du viewer si traduction disponible

**Step 5: Commit final**

```bash
git add -A
git commit -m "feat: stories complètes — rendu pixel-perfect, audio fond, prisme vocal, traduction auto"
```
