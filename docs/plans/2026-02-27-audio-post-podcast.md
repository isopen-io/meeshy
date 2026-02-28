# Audio Post (Podcast) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre la création de postes audio (podcast) depuis le Feed iOS — enregistrement ou import, transcription on-device en cascade puis serveur avec diarization, et affichage Prisme Linguistique dans les cartes de post.

**Architecture:** Le post est un container textuel (`Post.content` optionnel) + media attachés (`PostMedia[]`). L'audio est un `PostMedia` de type audio/*, uploadé via TUS. `PostMedia` est aligné sur `Attachment` en ajoutant `transcription Json?` et `translations Json?`. Tous les types Swift réutilisent les modèles existants des messages (`APIAttachmentTranscription`, `TranscriptionSegment`, `MessageTranscription`, `EdgeTranscriptionService`). Aucun nouveau type n'est créé.

**Tech Stack:** Prisma/MongoDB, TypeScript (Fastify gateway), Swift (SDK + iOS SwiftUI), Socket.IO `post:updated`, TUS upload, iOS `SFSpeechRecognizer` via `EdgeTranscriptionService`

---

## Vue d'ensemble des fichiers touchés

| Couche | Fichier | Action |
|--------|---------|--------|
| Schema | `packages/shared/prisma/schema.prisma` | Modifier `PostMedia` |
| SDK | `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | Modifier `APIPostMedia` + `APIPost.toFeedPost()` |
| SDK | `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | Modifier `FeedMedia` |
| SDK | `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` | Modifier `CreatePostRequest` + nouveau `MobileTranscriptionPayload` |
| Gateway | `services/gateway/src/routes/posts/PostsRoutes.ts` | Lire `mobileTranscription` à la création |
| Gateway | `services/gateway/src/services/posts/PostsService.ts` | Sauvegarder transcription dans `PostMedia` |
| Gateway | `services/gateway/src/services/posts/PostAudioService.ts` | Créer — pipeline audio pour posts |
| Gateway | `services/gateway/src/socketio/MeeshySocketIOManager.ts` | Router `transcriptionReady` vers posts |
| iOS | `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` | Ajouter bouton micro dans toolbar |
| iOS | `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift` | Flux audio : record/import → TUS → createPost |
| iOS | `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` | `createPost` + `mobileTranscription` |
| iOS | `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift` | `audioMediaView` affiche transcription |

---

### Task 1: Schema Prisma — Ajouter transcription + translations à PostMedia

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` — modèle `PostMedia` (~ligne 2685)

**Contexte:** `PostMedia` est le modèle Prisma des attachements de posts. Il doit être aligné sur `Attachment` (qui a déjà ces champs) pour supporter la transcription audio et les traductions audio.

**Step 1: Localiser le modèle PostMedia**

```bash
grep -n "model PostMedia" packages/shared/prisma/schema.prisma
# → ~2685
```

**Step 2: Ajouter les champs après `alt String?`**

Dans `model PostMedia`, après la ligne `alt String?`, ajouter :

```prisma
  // Transcription audio (même structure que Attachment.transcription)
  /// { text, segments[{text, start, end, speaker_id, confidence}], speakerCount, durationMs }
  transcription Json?

  // Traductions audio par langue (même structure que Attachment.translations)
  /// { "fr": { type, transcription, url, durationMs, format, cloned, quality, ttsModel, segments } }
  translations Json?
```

**Step 3: Push schema vers la DB**

```bash
cd packages/shared
npx prisma db push
```
Expected: `Your database is now in sync with your Prisma schema.`

**Step 4: Régénérer le client Prisma**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add transcription + translations fields to PostMedia"
```

---

### Task 2: SDK — Aligner APIPostMedia sur APIMessageAttachment

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`

**Contexte:** `APIPostMedia` est le type Decodable Swift pour les media d'un post. `APIMessageAttachment` (dans `MessageModels.swift`) a déjà `transcription: APIAttachmentTranscription?` et `translations: [String: APIAttachmentTranslation]?`. Ces types sont déjà définis — il suffit de les ajouter à `APIPostMedia`.

**Step 1: Lire le fichier actuel**

```bash
cat packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift | head -40
```

**Step 2: Ajouter les champs à APIPostMedia**

Dans `struct APIPostMedia: Decodable`, après `public let alt: String?`, ajouter :

```swift
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?
```

`APIAttachmentTranscription` et `APIAttachmentTranslation` sont définis dans `MessageModels.swift` — pas besoin d'import supplémentaire (même module).

**Step 3: Build SDK pour vérifier**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|Build complete"
```
Expected: `Build complete!`

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git commit -m "feat(sdk): add transcription + translations to APIPostMedia"
```

---

### Task 3: SDK — Ajouter transcription à FeedMedia + mettre à jour toFeedPost()

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` — `APIPost.toFeedPost()`

**Contexte:** `FeedMedia` est le modèle domain côté iOS. Il faut y ajouter `transcription: MessageTranscription?` (type existant dans `TranscriptionModels.swift`). Puis `toFeedPost()` convertit `APIPostMedia.transcription` (format API) en `MessageTranscription` (format domain).

**Step 1: Ajouter transcription à FeedMedia**

Dans `struct FeedMedia: Identifiable`, après `public var longitude: Double?`, ajouter :

```swift
    public var transcription: MessageTranscription?
```

Dans `public init(...)`, ajouter le paramètre après `longitude`:

```swift
                transcription: MessageTranscription? = nil
```

Et dans le corps de l'init :

```swift
        self.transcription = transcription
```

**Step 2: Mettre à jour toFeedPost() pour convertir la transcription**

Dans `extension APIPost`, modifier la closure `let feedMedia: [FeedMedia]` dans `toFeedPost()` :

```swift
        let feedMedia: [FeedMedia] = (media ?? []).map { m in
            let transcription: MessageTranscription? = m.transcription.map { t in
                let segments: [MessageTranscriptionSegment] = (t.segments ?? []).map { seg in
                    MessageTranscriptionSegment(
                        text: seg.text,
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        speakerId: seg.speakerId
                    )
                }
                return MessageTranscription(
                    attachmentId: m.id,
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    segments: segments,
                    speakerCount: t.speakerCount
                )
            }
            return FeedMedia(
                id: m.id, type: m.mediaType, url: m.fileUrl,
                thumbnailColor: thumbnailColorForMime(m.mimeType),
                width: m.width, height: m.height,
                duration: m.duration.map { $0 / 1000 },
                fileName: m.originalName ?? m.fileName,
                fileSize: m.fileSize.map { formatFileSize($0) },
                transcription: transcription
            )
        }
```

**Step 3: Build SDK**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|Build complete"
```
Expected: `Build complete!`

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git commit -m "feat(sdk): add transcription to FeedMedia, convert in toFeedPost()"
```

---

### Task 4: SDK — MobileTranscriptionPayload + mettre à jour CreatePostRequest

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`

**Contexte:** Pour envoyer la transcription on-device au serveur lors de la création d'un post audio, on ajoute `mobileTranscription: MobileTranscriptionPayload?` à `CreatePostRequest`. `MobileTranscriptionPayload` est un Encodable qui correspond exactement au format `mobileTranscription` déjà accepté par le gateway pour les messages.

**Step 1: Ajouter MobileTranscriptionPayload après la section `// MARK: - Post Requests`**

```swift
// MARK: - Mobile Transcription

public struct MobileTranscriptionSegment: Encodable {
    public let text: String
    public let start: Double?
    public let end: Double?
    public let speakerId: String?

    public init(text: String, start: Double? = nil, end: Double? = nil, speakerId: String? = nil) {
        self.text = text; self.start = start; self.end = end; self.speakerId = speakerId
    }

    enum CodingKeys: String, CodingKey {
        case text, start, end
        case speakerId = "speaker_id"
    }
}

public struct MobileTranscriptionPayload: Encodable {
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [MobileTranscriptionSegment]

    public init(text: String, language: String, confidence: Double? = nil,
                durationMs: Int? = nil, segments: [MobileTranscriptionSegment] = []) {
        self.text = text; self.language = language
        self.confidence = confidence; self.durationMs = durationMs; self.segments = segments
    }
}
```

**Step 2: Ajouter `mobileTranscription` à `CreatePostRequest`**

Dans `struct CreatePostRequest: Encodable`, après `public let audioDuration: Int?`, ajouter :

```swift
    public let mobileTranscription: MobileTranscriptionPayload?
```

Dans l'`init`, après `audioDuration: Int? = nil`, ajouter :

```swift
                mobileTranscription: MobileTranscriptionPayload? = nil
```

Et dans le corps :

```swift
        self.mobileTranscription = mobileTranscription
```

**Step 3: Ajouter `mobileTranscription` à `CreateStoryRequest` également** (cohérence, pour les stories audio futures)

Même ajout dans `struct CreateStoryRequest: Encodable`.

**Step 4: Mettre à jour `PostService.create()` pour passer le paramètre**

Dans `PostService.swift`, la méthode `create(...)` :

```swift
    public func create(content: String, type: String = "POST", visibility: String = "PUBLIC",
                       moodEmoji: String? = nil, mediaIds: [String]? = nil,
                       audioUrl: String? = nil, audioDuration: Int? = nil,
                       mobileTranscription: MobileTranscriptionPayload? = nil) async throws -> APIPost {
        let body = CreatePostRequest(
            content: content, type: type, visibility: visibility,
            moodEmoji: moodEmoji, mediaIds: mediaIds,
            audioUrl: audioUrl, audioDuration: audioDuration,
            mobileTranscription: mobileTranscription
        )
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }
```

**Step 5: Build SDK**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|Build complete"
```
Expected: `Build complete!`

**Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift
git commit -m "feat(sdk): add MobileTranscriptionPayload, update CreatePostRequest + PostService"
```

---

### Task 5: Gateway — Sauvegarder mobileTranscription dans PostMedia à la création

**Files:**
- Read first: `services/gateway/src/routes/posts/PostsRoutes.ts`
- Read first: `services/gateway/src/services/posts/PostsService.ts`
- Modify: `services/gateway/src/services/posts/PostsService.ts` (ou le handler de création)

**Contexte:** Quand le gateway reçoit `POST /posts` avec `mediaIds` et `mobileTranscription`, il doit créer les `PostMedia` depuis les `Attachment` référencés ET sauvegarder la `mobileTranscription` dans `PostMedia.transcription`. Chercher `mediaIds` dans le service pour trouver où les `PostMedia` sont créés.

**Step 1: Trouver où PostMedia est créé dans le gateway**

```bash
grep -rn "PostMedia\|postMedia\|mediaIds" services/gateway/src --include="*.ts" | grep -v ".test." | head -20
```

**Step 2: Lire le code de création de post**

Lire les fichiers identifiés pour comprendre le flux actuel.

**Step 3: Modifier la création de PostMedia**

Lors de la boucle sur `mediaIds`, après avoir créé chaque `PostMedia` depuis l'`Attachment`, vérifier si `mobileTranscription` est fourni :

```typescript
// Dans la boucle de création des PostMedia
for (const attachmentId of mediaIds) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) continue;

  const postMediaData: Prisma.PostMediaCreateInput = {
    post: { connect: { id: postId } },
    fileName: attachment.fileName,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    filePath: attachment.filePath,
    fileUrl: attachment.fileUrl,
    width: attachment.width,
    height: attachment.height,
    thumbnailUrl: attachment.thumbnailUrl,
    duration: attachment.duration,
    order: index,
    // Sauvegarder la transcription mobile si fournie pour ce media
    transcription: body.mobileTranscription ?? undefined,
  };

  await prisma.postMedia.create({ data: postMediaData });
}
```

Note : si `mobileTranscription` est pour un seul audio (un seul media audio par post), l'associer au premier `PostMedia` de type audio.

**Step 4: Ajouter le champ au schema Zod/validation du gateway**

Trouver le schéma de validation de `POST /posts` et ajouter `mobileTranscription` :

```typescript
mobileTranscription: z.object({
  text: z.string(),
  language: z.string(),
  confidence: z.number().optional(),
  durationMs: z.number().int().optional(),
  segments: z.array(z.object({
    text: z.string(),
    start: z.number().optional(),
    end: z.number().optional(),
    speaker_id: z.string().optional(),
  })).optional().default([]),
}).optional(),
```

**Step 5: Déclencher le traitement audio serveur (optionnel — pour diarization)**

Après la création du post, si un `PostMedia` audio existe et que `mobileTranscription` manque ou `speakerCount` vaut 1 (pas de diarization faite), déclencher `PostAudioService.processPostAudio()` (créé à la Task 6).

```typescript
// Fire-and-forget — ne pas bloquer la réponse
if (audioPostMedia) {
  PostAudioService.shared.processPostAudio({
    postId: post.id,
    postMediaId: audioPostMedia.id,
    fileUrl: audioPostMedia.fileUrl,
    authorId: post.authorId,
    mobileTranscription: body.mobileTranscription,
  }).catch(err => log.error({ err }, 'Post audio processing failed'));
}
```

**Step 6: Tests**

```bash
cd services/gateway && npm test -- --testPathPattern="posts" 2>&1 | tail -20
```

**Step 7: Commit**

```bash
git add services/gateway/src/
git commit -m "feat(gateway): save mobileTranscription in PostMedia on post creation"
```

---

### Task 6: Gateway — PostAudioService (pipeline audio pour PostMedia)

**Files:**
- Create: `services/gateway/src/services/posts/PostAudioService.ts`
- Read first: `services/gateway/src/services/message-translation/MessageTranslationService.ts` (pour comprendre le pattern)
- Read first: `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` (pour `broadcastPostUpdated`)
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts` (router `transcriptionReady` vers posts)

**Contexte:** Adapter la pipeline existante des messages audio (`MessageTranslationService.processAudioAttachment()`) pour les posts. Quand la transcription serveur (Whisper + diarization) est prête, mettre à jour `PostMedia.transcription` et émettre `post:updated` via `SocialEventsHandler.broadcastPostUpdated()`.

**Step 1: Créer PostAudioService.ts**

```typescript
import { prisma } from '../../db/prisma.js';
import { ZmqTranslationService } from '../zmq-translation/ZmqTranslationService.js';
import { log } from '../../logger.js';

interface PostAudioProcessInput {
  postId: string;
  postMediaId: string;
  fileUrl: string;
  authorId: string;
  mobileTranscription?: unknown; // déjà sauvegardé mais on peut déclencher serveur pour diarization
}

export class PostAudioService {
  static readonly shared = new PostAudioService();
  private constructor() {}

  async processPostAudio(input: PostAudioProcessInput): Promise<void> {
    const { postId, postMediaId, fileUrl, authorId } = input;

    try {
      // Envoyer à ZMQ comme pour les messages
      await ZmqTranslationService.shared.sendAudioRequest({
        postId,          // nouveau champ dans AudioProcessRequest
        postMediaId,
        audioUrl: fileUrl,
        targetLanguages: [], // pas de cible spécifique — transcription only
      });
    } catch (err) {
      log.error({ err, postId, postMediaId }, 'Failed to send post audio to ZMQ');
    }
  }

  async handleTranscriptionReady(postId: string, postMediaId: string, transcription: unknown): Promise<void> {
    // Mettre à jour PostMedia.transcription
    await prisma.postMedia.update({
      where: { id: postMediaId },
      data: { transcription: transcription as object },
    });

    // Récupérer le post mis à jour et broadcaster
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: true,
        media: true,
        // ... inclusions nécessaires pour broadcastPostUpdated
      },
    });

    if (post) {
      // Utiliser la même fonction que les autres events post
      await SocialEventsHandler.broadcastPostUpdated(post, post.authorId);
    }
  }
}
```

**Step 2: Ajouter postId + postMediaId à AudioProcessRequest**

Dans `services/gateway/src/services/zmq-translation/types.ts`, ajouter les champs optionnels :

```typescript
export interface AudioProcessRequest {
  messageId?: string;       // existant — optional maintenant
  conversationId?: string;  // existant — optional maintenant
  postId?: string;          // nouveau
  postMediaId?: string;     // nouveau
  // ... reste des champs
}
```

**Step 3: Router transcriptionReady vers PostAudioService**

Dans `MeeshySocketIOManager.ts`, dans `_handleTranscriptionReady` :

```typescript
private async _handleTranscriptionReady(event: TranscriptionReadyEvent): Promise<void> {
  if (event.postId && event.postMediaId) {
    // Route vers PostAudioService
    await PostAudioService.shared.handleTranscriptionReady(
      event.postId,
      event.postMediaId,
      event.transcription
    );
    return;
  }
  // ... logique existante pour messages
}
```

**Step 4: Tests**

```bash
cd services/gateway && npm test -- --testPathPattern="PostAudio" 2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add services/gateway/src/services/posts/PostAudioService.ts \
        services/gateway/src/services/zmq-translation/types.ts \
        services/gateway/src/socketio/MeeshySocketIOManager.ts
git commit -m "feat(gateway): PostAudioService — pipeline audio pour PostMedia, router transcriptionReady"
```

---

### Task 7: iOS — Bouton micro + flux audio dans le Feed composer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` — toolbar composer
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift` — `publishPostWithAttachments()` + nouveau flux audio
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` — `createPost` + `mobileTranscription`

**Contexte:** `FeedView.swift` a déjà `@StateObject var audioRecorder = AudioRecorderManager()`. La toolbar a : photo, camera, emoji (no-op), doc, location — il faut ajouter micro. Le flux est : enregistrement/import → TUS upload → `EdgeTranscriptionService` on-device → `createPost(mediaIds:mobileTranscription:)`.

**Step 1: Ajouter bouton micro à la toolbar du composer dans FeedView.swift**

Trouver la toolbar HStack avec les boutons `photo.on.rectangle`, `camera`, etc. Ajouter avant ou après :

```swift
Button(action: { showAudioComposer = true }) {
    Image(systemName: "mic.fill")
        .foregroundStyle(Color(hex: theme.primaryHex))
        .frame(width: 36, height: 36)
}
```

Ajouter l'état `@State private var showAudioComposer = false` en haut du body.

Ajouter le sheet :

```swift
.sheet(isPresented: $showAudioComposer) {
    AudioPostComposerView(
        onPublish: { audioURL, mimeType, transcription in
            showAudioComposer = false
            Task {
                await publishAudioPost(audioURL: audioURL, mimeType: mimeType, transcription: transcription)
            }
        }
    )
}
```

**Step 2: Créer AudioPostComposerView**

Créer `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift` :

```swift
import SwiftUI
import MeeshySDK

struct AudioPostComposerView: View {
    let onPublish: (URL, String, MobileTranscriptionPayload?) -> Void

    @State private var isRecording = false
    @State private var recordedURL: URL?
    @State private var transcription: OnDeviceTranscription?
    @State private var isTranscribing = false
    @State private var descriptionText = ""

    @ObservedObject private var recorder = AudioRecorderManager.shared
    @ObservedObject private var transcriber = EdgeTranscriptionService.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Zone d'enregistrement
                recordingSection

                // Transcription preview (si disponible)
                if let t = transcription {
                    transcriptionPreview(t)
                }

                // Description optionnelle
                TextField("Description optionnelle...", text: $descriptionText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                Spacer()
            }
            .navigationTitle("Nouveau podcast")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publier") {
                        guard let url = recordedURL else { return }
                        let payload = transcription.map { buildPayload($0) }
                        onPublish(url, "audio/m4a", payload)
                    }
                    .disabled(recordedURL == nil)
                    .bold()
                }
            }
        }
    }

    private var recordingSection: some View {
        VStack(spacing: 16) {
            // Bouton enregistrement principal
            Button(action: toggleRecording) {
                ZStack {
                    Circle()
                        .fill(isRecording ? Color.red : Color(hex: "9B59B6"))
                        .frame(width: 80, height: 80)
                    Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.white)
                }
            }

            Text(isRecording ? "Appuyer pour arrêter" : (recordedURL != nil ? "Enregistrement prêt" : "Appuyer pour enregistrer"))
                .font(.caption)
                .foregroundStyle(.secondary)

            // Bouton import fichier audio
            Button("Importer un fichier audio") {
                // Présenter DocumentPicker pour audio
            }
            .font(.caption)
        }
        .padding(.top, 32)
    }

    private func transcriptionPreview(_ t: OnDeviceTranscription) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Transcription", systemImage: "text.bubble")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(t.text)
                .font(.body)
                .padding(12)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
        .padding(.horizontal)
    }

    private func toggleRecording() {
        if isRecording {
            recorder.stopRecording { url in
                recordedURL = url
                isRecording = false
                if let url {
                    Task { await runTranscription(url: url) }
                }
            }
        } else {
            recorder.startRecording()
            isRecording = true
            transcription = nil
        }
    }

    private func runTranscription(url: URL) async {
        isTranscribing = true
        transcription = try? await transcriber.transcribe(audioURL: url)
        isTranscribing = false
    }

    private func buildPayload(_ t: OnDeviceTranscription) -> MobileTranscriptionPayload {
        let segments = t.segments.map {
            MobileTranscriptionSegment(text: $0.text, start: $0.timestamp, end: $0.timestamp + $0.duration)
        }
        return MobileTranscriptionPayload(
            text: t.text, language: t.language,
            confidence: t.confidence, durationMs: recordedURL.flatMap { try? Data(contentsOf: $0) }.map { _ in nil } ?? nil,
            segments: segments
        )
    }
}
```

**Step 3: Ajouter publishAudioPost dans FeedView+Attachments.swift**

```swift
func publishAudioPost(audioURL: URL, mimeType: String, transcription: MobileTranscriptionPayload?) async {
    guard let token = APIClient.shared.authToken else { return }
    let serverOrigin = MeeshyConfig.shared.serverOrigin
    guard let baseURL = URL(string: serverOrigin) else { return }

    do {
        let uploader = TusUploadManager(baseURL: baseURL)
        let result = try await uploader.uploadFile(fileURL: audioURL, mimeType: mimeType, token: token)

        await feedViewModel.createPost(
            content: feedViewModel.postText.isEmpty ? nil : feedViewModel.postText,
            mediaIds: [result.id],
            mobileTranscription: transcription
        )
        feedViewModel.postText = ""
    } catch {
        feedViewModel.publishError = error.localizedDescription
    }
}
```

**Step 4: Mettre à jour FeedViewModel.createPost**

```swift
func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC",
                mediaIds: [String]? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async {
    isPublishing = true
    defer { isPublishing = false }
    do {
        let post = try await PostService.shared.create(
            content: content ?? postText,
            type: type,
            visibility: visibility,
            mediaIds: mediaIds,
            mobileTranscription: mobileTranscription
        )
        let feedPost = post.toFeedPost()
        await MainActor.run {
            posts.insert(feedPost, at: 0)
            postText = ""
        }
    } catch {
        publishError = error.localizedDescription
    }
}
```

**Step 5: Build app**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -20
```
Expected: `** BUILD SUCCEEDED **`

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift \
        apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift \
        apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git commit -m "feat(ios): audio post composer — mic button, recording, on-device transcription, TUS upload"
```

---

### Task 8: iOS — Afficher la transcription dans audioMediaView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift` — `audioMediaView(_ media: FeedMedia)`

**Contexte:** `audioMediaView` affiche déjà le bouton play et la durée. Il faut ajouter le texte de transcription si `media.transcription != nil`. Réutiliser `TranscriptionDisplaySegment.buildFrom()` pour un affichage coloré par speaker.

**Step 1: Étendre audioMediaView pour afficher la transcription**

Dans `func audioMediaView(_ media: FeedMedia) -> some View`, après le `HStack` existant (play + duration), ajouter :

```swift
// Affichage transcription si disponible
if let transcription = media.transcription, !transcription.text.isEmpty {
    VStack(alignment: .leading, spacing: 4) {
        let displaySegments = TranscriptionDisplaySegment.buildFrom(transcription)

        if displaySegments.count > 1 {
            // Affichage multi-speaker coloré
            ForEach(displaySegments) { seg in
                HStack(alignment: .top, spacing: 8) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: seg.speakerColor))
                        .frame(width: 3)
                    Text(seg.text)
                        .font(.caption)
                        .foregroundStyle(.primary.opacity(0.85))
                }
            }
        } else {
            // Texte simple
            Text(transcription.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(4)
        }
    }
    .padding(.top, 8)
}
```

**Step 2: Gérer le cas post:updated Socket pour rafraîchir la transcription**

Dans `FeedViewModel`, s'abonner au publisher `SocialSocketManager.shared.postUpdatedPublisher` et mettre à jour le post dans la liste :

```swift
// Dans init ou onAppear
SocialSocketManager.shared.postUpdatedPublisher
    .receive(on: DispatchQueue.main)
    .sink { [weak self] updatedPost in
        guard let self, let idx = self.posts.firstIndex(where: { $0.id == updatedPost.id }) else { return }
        self.posts[idx] = updatedPost.toFeedPost()
    }
    .store(in: &cancellables)
```

Note: vérifier si `SocialSocketManager.postUpdatedPublisher` expose un `APIPost` ou un type différent — adapter.

**Step 3: Build + run sur simulateur**

```bash
./apps/ios/meeshy.sh run
```

Tester : créer un post audio depuis le Feed, vérifier que la transcription s'affiche dans la carte.

**Step 4: Commit final**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git commit -m "feat(ios): display transcription in audioMediaView, subscribe to post:updated"
```

---

### Task 9: Push + PR

**Step 1: Vérifier que tout build**

```bash
./apps/ios/meeshy.sh build
cd services/gateway && npm run build
cd packages/MeeshySDK && swift build
```

**Step 2: Push et créer PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat: audio post (podcast) avec transcription on-device + pipeline serveur" \
  --body "$(cat <<'EOF'
## Summary
- PostMedia aligné sur Attachment (transcription + translations)
- APIPostMedia, FeedMedia mis à jour — réutilise APIAttachmentTranscription, MessageTranscription
- MobileTranscriptionPayload pour envoyer la transcription iOS on-device au gateway
- PostAudioService gateway — pipeline Whisper + diarization pour PostMedia
- Feed composer iOS — bouton micro, AudioPostComposerView, TUS upload audio
- audioMediaView affiche la transcription avec couleurs speakers

## Test plan
- [ ] Créer un post audio depuis le Feed (enregistrement)
- [ ] Vérifier upload TUS → PostMedia créé en DB avec transcription iOS
- [ ] Vérifier que le gateway déclenche Whisper si disponible
- [ ] Vérifier `post:updated` Socket → transcription mise à jour en temps réel
- [ ] Vérifier affichage multi-speaker dans la carte de post
EOF
)"
```
