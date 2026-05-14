# iOS Communication Notifications — Avatar + Media Inline (Style WhatsApp/Telegram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que les notifications iOS affichent l'avatar de l'auteur à gauche (avec le badge app Meeshy en bas à droite, comportement iOS natif) et que les media attachés (audio, image, vidéo) soient affichés directement dans le banner (compact + expanded), au lieu du comportement actuel (icône app à gauche, avatar attaché en mauvais slot, media absents du payload).

**Architecture:** Côté iOS, la `UNNotificationServiceExtension` (`apps/ios/MeeshyNotificationExtension/NotificationService.swift`) existe déjà et appelle `INSendMessageIntent` (Communication Notifications, iOS 15+) — mais elle attache l'avatar comme `UNNotificationAttachment` en plus, ce qui prend le slot media et confond le rendu OS. On sépare les deux usages : avatar → uniquement `INPerson.image`, media du message → `UNNotificationAttachment`. Côté gateway, on étend le payload APN pour porter l'URL + mime du media (`attachmentUrl`, `attachmentMimeType`) et les métadonnées des contextes (post preview pour social, emoji pour reaction, caller avatar pour calls).

**Tech Stack:** Swift 6 + iOS 15+ (`Intents` framework, `UserNotifications`), TypeScript 5.9 (gateway Fastify 5), Prisma 6 (MongoDB), `@parse/node-apn` 7.

---

## Roadmap (5 phases dans un plan unique, livrables indépendamment)

| Phase | Scope | Statut |
|---|---|---|
| **A. Core fix + messages avec media** | Séparer avatar vs media dans iOS extension. Étendre payload gateway pour porter `attachmentUrl`/`attachmentMimeType`. Couvre `new_message`, `message_reply`, `message_forwarded`. Audio: transcription en body + audio attaché. | **Détaillé ci-dessous** |
| B. Reactions | Notif `message_reaction` avec emoji affiché à droite (style "❤️ on your message"). | Esquisse à la fin |
| C. Calls (APN non-VoIP) | `missed_call`, `call_ended`, `call_declined`, `call_recording_ready`. Avatar du caller + icône type d'appel. VoIP `incoming_call` reste sur le chemin PushKit séparé. | Esquisse à la fin |
| D. Social | `post_like`, `post_comment`, `post_repost`, `story_reaction`, `comment_like`, `comment_reply` avec preview du post/story en attachment. | Esquisse à la fin |
| E. Friend requests | `friend_request`, `contact_request` avec avatar uniquement (déjà via Comm Notif), juste vérifier que tout passe par le bon path. | Esquisse à la fin |

Chaque phase est mergeable indépendamment. Phase A résout le bug principal observé par l'utilisateur.

---

## Phase A — Core fix iOS extension + messages avec media

### Diagnostic confirmé

État actuel observé (`NotificationService.swift:77-110`) :
```swift
if let imageURLString = userInfo["imageURL"] as? String, let imageURL = URL(string: imageURLString) {
    downloadAvatarData(from: imageURL) { [weak self] avatarData in
        if let avatarData {
            let attachment = self.createAttachment(from: avatarData, ...)
            if let attachment {
                bestAttemptContent.attachments = [attachment]   // ⚠️ avatar pris pour media
            }
        }
        if isCommunicationType {
            let finalContent = self.applyCommunicationIntent(to: bestAttemptContent, avatarData: avatarData)
            // ↑ INPerson.image reçoit aussi avatarData, mais l'attachment dominate visuellement
            contentHandler(finalContent)
        }
        ...
    }
}
```

Conséquence : iOS rend l'attachment image (avatar) comme media du message → banner compact affiche l'icône app à gauche par défaut, long press montre l'avatar comme image. C'est exactement le symptôme rapporté.

Côté gateway (`services/gateway/src/services/notifications/NotificationService.ts:374-394`), le payload contient `imageURL: params.actor?.avatar` mais aucun champ `attachmentUrl` / `attachmentMimeType` pour le média du message.

### File Structure

| Fichier | Action | Responsabilité après changement |
|---|---|---|
| `apps/ios/MeeshyNotificationExtension/NotificationService.swift` | Modify | Toujours porter avatar UNIQUEMENT via INPerson.image. Téléchargement séparé du media du message (depuis `attachmentUrl`) qui devient le seul `UNNotificationAttachment`. |
| `services/gateway/src/services/notifications/NotificationService.ts` | Modify | `createMessageNotification` accepte `firstAttachmentUrl` + `firstAttachmentMimeType` et les propage au payload APN. |
| `services/gateway/src/services/messaging/MessageProcessor.ts` | Modify | `handleMentionsAndNotifications` extrait l'URL + mime du premier attachment du message (déjà rafraîchi en mémoire) et l'inclut dans l'appel `createMessageNotification`. Si audio + transcription présente, body = transcription. |
| `services/gateway/src/services/notifications/NotificationFormatter.ts` | Modify (mineur) | `formatAttachmentNotificationBody` peut rester tel quel ; on l'utilise seulement si pas de transcription. |
| `services/gateway/src/__tests__/unit/services/NotificationService.test.ts` | Modify | Tests étendus avec assertions sur les nouveaux champs payload. |

Aucun nouveau fichier — toutes les modifications sont localisées.

### Format de payload APN final (Phase A)

```jsonc
{
  "aps": {
    "alert": { "title": "Alice", "body": "Tu viens demain ?" },
    "category": "MEESHY_MESSAGE",
    "thread-id": "conv-id",
    "mutable-content": 1,
    "content-available": 1,
    "sound": "default",
    "badge": 3
  },
  "type": "new_message",
  "conversationId": "...",
  "conversationTitle": "...",
  "conversationType": "direct",
  "messageId": "...",
  "senderId": "...",
  "senderUsername": "alice",
  "senderDisplayName": "Alice",
  "senderAvatar": "https://meeshy.me/uploads/avatars/...",
  "imageURL": "https://meeshy.me/uploads/avatars/...",        // alias historique, encore lu par l'extension
  "attachmentUrl": "https://meeshy.me/uploads/voice/abc.m4a",  // NOUVEAU — vide si pas d'attachment
  "attachmentMimeType": "audio/m4a",                           // NOUVEAU — vide si pas d'attachment
  "attachmentDurationMs": 4500,                                // NOUVEAU — utile pour audio preview UI
  "encryptedContent": "",
  "notificationLocKey": ""
}
```

Côté extension iOS, la règle :
- `imageURL` (ou `senderAvatar`) → toujours interprété comme avatar → seulement dans `INPerson.image` (Communication Notifications), JAMAIS attaché.
- `attachmentUrl` non-vide + `attachmentMimeType` matchant un type natif (`image/*`, `audio/*`, `video/*`) → téléchargé et passé en `UNNotificationAttachment` (avec `typeHint` correct pour iOS UTI).
- `attachmentUrl` vide → pas d'attachment, juste avatar + texte.

---

### Task A.1 — Extension iOS : séparer avatar vs message attachment

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

- [ ] **Step A.1.1 : Read fichier**

Run : Read `apps/ios/MeeshyNotificationExtension/NotificationService.swift` pour cadrer l'état exact (le diagnostic ci-dessus a été extrait d'une lecture antérieure mais re-lire avant édition).

- [ ] **Step A.1.2 : Refactor la section "download & attach" pour séparer les deux usages**

Remplacer le bloc lignes 73-110 (depuis `let isCommunicationType = ...` jusqu'avant `override func serviceExtensionTimeWillExpire()`) par :

```swift
let isCommunicationType = Self.communicationTypes.contains(
    userInfo["type"] as? String ?? ""
)

// 1. Charger l'avatar de l'auteur — UNIQUEMENT pour INPerson.image, jamais comme attachment.
// 2. Charger le media du message (si présent) — devient le seul UNNotificationAttachment.
// Les deux téléchargements sont indépendants ; on dispatch via DispatchGroup pour ne ack
// qu'une seule fois quand les deux sont terminés (ou timeout via serviceExtensionTimeWillExpire).
let group = DispatchGroup()
var avatarData: Data?
var messageAttachment: UNNotificationAttachment?

if let avatarURLString = userInfo["imageURL"] as? String,
   let avatarURL = URL(string: avatarURLString),
   !avatarURLString.isEmpty {
    group.enter()
    downloadData(from: avatarURL) { data in
        avatarData = data
        group.leave()
    }
}

if let attachmentURLString = userInfo["attachmentUrl"] as? String,
   let attachmentURL = URL(string: attachmentURLString),
   !attachmentURLString.isEmpty {
    let mime = userInfo["attachmentMimeType"] as? String ?? ""
    group.enter()
    downloadData(from: attachmentURL) { data in
        defer { group.leave() }
        guard let data else { return }
        messageAttachment = self.createMessageAttachment(
            from: data,
            originalURL: attachmentURL,
            mimeType: mime
        )
    }
}

group.notify(queue: .global(qos: .userInitiated)) { [weak self] in
    guard let self else {
        contentHandler(bestAttemptContent)
        return
    }
    if let messageAttachment {
        bestAttemptContent.attachments = [messageAttachment]
    }
    if isCommunicationType {
        let finalContent = self.applyCommunicationIntent(
            to: bestAttemptContent,
            avatarData: avatarData
        )
        contentHandler(finalContent)
    } else {
        contentHandler(bestAttemptContent)
    }
}
```

- [ ] **Step A.1.3 : Renommer `downloadAvatarData` en `downloadData` (générique) et préserver son comportement**

L'ancien method ligne 417-430 :
```swift
private func downloadAvatarData(from url: URL, completion: @escaping (Data?) -> Void) {
    nonisolated(unsafe) let completion = completion
    let task = URLSession.shared.dataTask(with: url) { data, _, error in
        guard let data, error == nil else { completion(nil); return }
        completion(data)
    }
    task.resume()
}
```
devient (juste rename + commentaire) :
```swift
/// Generic data download for any push payload URL (avatar or message media).
/// Fire-and-forget — completion is invoked exactly once, with nil on any failure.
private func downloadData(from url: URL, completion: @escaping (Data?) -> Void) {
    nonisolated(unsafe) let completion = completion
    let task = URLSession.shared.dataTask(with: url) { data, _, error in
        guard let data, error == nil else { completion(nil); return }
        completion(data)
    }
    task.resume()
}
```

- [ ] **Step A.1.4 : Remplacer `createAttachment(from:fileExtension:)` par `createMessageAttachment(from:originalURL:mimeType:)`**

L'ancien method ligne 433-448 ne supporte que JPG/PNG par défaut. Le nouveau gère audio + video + image via UTI :

```swift
/// Creates a UNNotificationAttachment from raw bytes for a message media.
/// Picks the right file extension + UTI typeHint so iOS renders the attachment
/// in its native style (image preview, audio waveform with play button, video
/// thumbnail with tap-to-play).
private func createMessageAttachment(
    from data: Data,
    originalURL: URL,
    mimeType: String
) -> UNNotificationAttachment? {
    let (ext, typeHint) = Self.fileHints(mimeType: mimeType, fallbackPathExtension: originalURL.pathExtension)
    let tempFile = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString + "." + ext)
    do {
        try data.write(to: tempFile)
        var options: [String: Any] = [:]
        if let typeHint {
            options[UNNotificationAttachmentOptionsTypeHintKey] = typeHint
        }
        return try UNNotificationAttachment(
            identifier: UUID().uuidString,
            url: tempFile,
            options: options.isEmpty ? nil : options
        )
    } catch {
        return nil
    }
}

/// Maps a payload mime type (or a URL path extension fallback) to a UTI typeHint
/// and a sensible file extension. Returns (`m4a`, `public.audio`) for unknown
/// audio etc. so iOS still treats the attachment as a media of the right family.
private static func fileHints(
    mimeType: String,
    fallbackPathExtension: String
) -> (ext: String, typeHint: String?) {
    let normalized = mimeType.lowercased()
    if normalized.hasPrefix("image/") {
        if normalized.contains("png") { return ("png", "public.png") }
        if normalized.contains("gif") { return ("gif", "com.compuserve.gif") }
        if normalized.contains("webp") { return ("webp", "org.webmproject.webp") }
        if normalized.contains("heic") { return ("heic", "public.heic") }
        return ("jpg", "public.jpeg")
    }
    if normalized.hasPrefix("audio/") {
        if normalized.contains("m4a") || normalized.contains("mp4a") || normalized.contains("aac") {
            return ("m4a", "com.apple.m4a-audio")
        }
        if normalized.contains("mp3") || normalized.contains("mpeg") {
            return ("mp3", "public.mp3")
        }
        if normalized.contains("wav") {
            return ("wav", "com.microsoft.waveform-audio")
        }
        if normalized.contains("ogg") {
            return ("ogg", "public.audio")
        }
        return ("m4a", "public.audio")
    }
    if normalized.hasPrefix("video/") {
        if normalized.contains("quicktime") || normalized.contains("mov") {
            return ("mov", "com.apple.quicktime-movie")
        }
        return ("mp4", "public.mpeg-4")
    }
    // Unknown mime — fall back to the URL extension if any, no typeHint.
    let ext = fallbackPathExtension.isEmpty ? "bin" : fallbackPathExtension
    return (ext, nil)
}
```

Et supprimer l'ancien `createAttachment(from:fileExtension:)`.

- [ ] **Step A.1.5 : Build iOS pour valider**

Run : `./apps/ios/meeshy.sh build`
Expected : `Build succeeded` (les warnings préexistants peuvent rester, mais aucun nouveau sur ce fichier).

- [ ] **Step A.1.6 : Commit**

```bash
git add apps/ios/MeeshyNotificationExtension/NotificationService.swift
git commit -m "fix(ios/notif-extension): separate avatar (INPerson.image) from message media attachment

The extension used to attach the sender's avatar as a UNNotificationAttachment
on top of feeding it to INSendMessageIntent. iOS rendered the attachment as
the message media — which meant the banner showed the app icon on the left
(default fallback) and long-press revealed the avatar in the media slot
instead of the actual message content.

Now the avatar is bound EXCLUSIVELY to INPerson.image (Communication
Notifications style — WhatsApp/Telegram-like avatar on the left, app badge
on the bottom-right). The UNNotificationAttachment slot is reserved for the
message media itself, downloaded from the new \`attachmentUrl\` + \`attachmentMimeType\`
payload fields with a proper UTI typeHint so iOS picks the right inline
renderer (image preview, audio waveform with play button, video thumbnail
with tap-to-play).

Falls back gracefully when either URL is missing or fails to download."
```

---

### Task A.2 — Gateway : étendre `createMessageNotification` pour porter l'URL du media

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts:556-631` (signature + propagation au payload)
- Modify: `services/gateway/src/services/notifications/NotificationService.ts:374-394` (champs additionnels)

- [ ] **Step A.2.1 : Read `createMessageNotification` complet**

Run : Read `services/gateway/src/services/notifications/NotificationService.ts:550-635`.

- [ ] **Step A.2.2 : Ajouter `firstAttachmentUrl` + `firstAttachmentMimeType` + `firstAttachmentDurationMs` à la signature de `createMessageNotification`**

Remplacer le bloc de signature (lignes 556-572) :
```typescript
async createMessageNotification(params: {
  recipientUserId: string;
  senderId: string;
  messageId: string;
  conversationId: string;
  messagePreview: string;
  hasAttachments?: boolean;
  attachmentCount?: number;
  firstAttachmentType?: 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';
  firstAttachmentFilename?: string;
  firstAttachmentFileSize?: number | null;
  firstAttachmentDuration?: number | null;
  firstAttachmentWidth?: number | null;
  firstAttachmentHeight?: number | null;
  encryptedContent?: string;
  notificationLocKey?: string;
}): Promise<Notification | null> {
```
par :
```typescript
async createMessageNotification(params: {
  recipientUserId: string;
  senderId: string;
  messageId: string;
  conversationId: string;
  messagePreview: string;
  hasAttachments?: boolean;
  attachmentCount?: number;
  firstAttachmentType?: 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';
  firstAttachmentFilename?: string;
  firstAttachmentFileSize?: number | null;
  firstAttachmentDuration?: number | null;
  firstAttachmentWidth?: number | null;
  firstAttachmentHeight?: number | null;
  /** URL accessible publiquement pour le 1er attachment (image/audio/video).
   *  L'extension iOS télécharge ce fichier et le rend en UNNotificationAttachment
   *  natif (waveform pour audio, preview pour image, thumbnail pour video). */
  firstAttachmentUrl?: string;
  /** MIME type du 1er attachment, ex. `audio/m4a`, `image/jpeg`, `video/mp4`.
   *  Utilisé par l'extension pour choisir le UTI typeHint correct. */
  firstAttachmentMimeType?: string;
  encryptedContent?: string;
  notificationLocKey?: string;
}): Promise<Notification | null> {
```

- [ ] **Step A.2.3 : Propager les nouveaux champs dans le `context` de `createNotification(...)`**

Le `context` interne (lignes 610-617) devient :
```typescript
context: {
  conversationId: params.conversationId,
  conversationTitle: conversation?.title,
  conversationType: conversation?.type as any,
  messageId: params.messageId,
  // Phase A — propagation au payload APN pour rendu media inline iOS.
  firstAttachmentUrl: params.firstAttachmentUrl,
  firstAttachmentMimeType: params.firstAttachmentMimeType,
  firstAttachmentDurationMs: params.firstAttachmentDuration != null
    ? Math.round(params.firstAttachmentDuration * 1000)
    : undefined,
  encryptedContent: params.encryptedContent,
  notificationLocKey: params.notificationLocKey,
},
```

- [ ] **Step A.2.4 : Étendre `NotificationContext` interface pour accepter ces 3 champs**

Localiser (vraisemblablement lignes 1330-1360 d'après le grep antérieur) le type `NotificationContext`. Read `services/gateway/src/services/notifications/NotificationService.ts:1325-1360` pour cadrer, puis ajouter dans le type :
```typescript
firstAttachmentUrl?: string;
firstAttachmentMimeType?: string;
firstAttachmentDurationMs?: number;
```

- [ ] **Step A.2.5 : Étendre le payload `data` envoyé à `pushService.sendToUser(...)`**

Dans le bloc `pushService.sendToUser({...})` (lignes 367-395), remplacer la section `data:` par :
```typescript
data: {
  type: params.type,
  conversationId: params.context.conversationId || '',
  conversationTitle: params.context.conversationTitle || '',
  conversationType: params.context.conversationType || '',
  messageId: params.context.messageId || '',
  postId: params.context.postId || '',
  postType: (params.metadata && 'postType' in params.metadata ? String(params.metadata.postType ?? '') : ''),
  senderId: params.actor?.id || '',
  senderUsername: params.actor?.username || '',
  senderDisplayName: params.actor?.displayName || '',
  senderAvatar: params.actor?.avatar || '',
  imageURL: params.actor?.avatar || '',
  // Phase A — message media inline (audio waveform, image preview, video thumb).
  attachmentUrl: params.context.firstAttachmentUrl || '',
  attachmentMimeType: params.context.firstAttachmentMimeType || '',
  attachmentDurationMs: params.context.firstAttachmentDurationMs != null
    ? String(params.context.firstAttachmentDurationMs)
    : '',
  encryptedContent: params.context.encryptedContent || '',
  notificationLocKey: params.context.notificationLocKey || '',
},
```

(APN restreint `data` à `Record<string, string>` quand on passe par Firebase, d'où le `String(...)` sur `attachmentDurationMs`.)

- [ ] **Step A.2.6 : Typecheck**

Run : `cd services/gateway && pnpm exec tsc --noEmit 2>&1 | grep -v "sanitize.ts"`
Expected : aucune erreur nouvelle (seule l'erreur préexistante `sanitize.ts` peut rester).

- [ ] **Step A.2.7 : Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts
git commit -m "feat(gateway/notif): carry first-attachment URL + mime to APN payload

Adds firstAttachmentUrl, firstAttachmentMimeType and firstAttachmentDurationMs
to createMessageNotification and propagates them to the APN \`data\` payload
as \`attachmentUrl\` / \`attachmentMimeType\` / \`attachmentDurationMs\`. The
iOS notification service extension reads these and renders the media inline
(audio waveform with play, image preview, video thumbnail with tap-to-play).
Existing callers without attachments are unaffected — the fields default to
empty strings, which the extension already treats as 'no attachment'."
```

---

### Task A.3 — Caller `MessageProcessor` : extraire URL + mime du premier attachment

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts` (méthode `handleMentionsAndNotifications`)

- [ ] **Step A.3.1 : Localiser le call à `createMessageNotification` dans `MessageProcessor`**

Run : `grep -n "createMessageNotification" services/gateway/src/services/messaging/MessageProcessor.ts`. Probable autour de ligne 600-660. Read le contexte (50 lignes autour) pour cadrer la signature actuelle de l'appel.

- [ ] **Step A.3.2 : Récupérer `firstAttachmentUrl` + `firstAttachmentMimeType` depuis `message.attachments`**

Juste avant l'appel à `createMessageNotification`, ajouter :
```typescript
// Phase A — extraire l'URL + mime du premier attachment pour rich push iOS.
// `message.attachments` a été rafraîchi par saveMessage:530 quand des
// attachmentIds étaient fournis, donc on a la version persistée avec fileUrl.
const firstAttachment = (message as Message & {
  attachments?: Array<{ fileUrl?: string; mimeType?: string; duration?: number | null }>
}).attachments?.[0];
const firstAttachmentUrl = firstAttachment?.fileUrl || undefined;
const firstAttachmentMimeType = firstAttachment?.mimeType || undefined;
const firstAttachmentDuration = firstAttachment?.duration ?? undefined;
```

Puis dans l'appel `createMessageNotification({...})`, ajouter les 3 champs :
```typescript
firstAttachmentUrl,
firstAttachmentMimeType,
firstAttachmentDuration,
```

- [ ] **Step A.3.3 : Si attachment audio + transcription présente, utiliser la transcription comme `messagePreview`**

Toujours juste avant l'appel, après les 3 lignes du Step A.3.2 :
```typescript
// Phase A — si l'audio a déjà été transcrit (cas rare au moment du push
// initial, mais possible si une étape de pré-transcription côté upload a
// tourné), utiliser le transcript en body pour donner du contexte
// immédiat au destinataire. Le fichier audio reste attaché pour écoute.
const firstAttachmentTranscript =
  firstAttachmentMimeType?.startsWith('audio/') && firstAttachment
    ? extractTranscriptionText(firstAttachment as unknown as { transcription?: unknown })
    : undefined;
const messagePreviewForPush = firstAttachmentTranscript ?? messagePreview;
```

Puis dans l'appel : `messagePreview: messagePreviewForPush` (au lieu de `messagePreview: messagePreview`).

Si le helper `extractTranscriptionText` n'existe pas, l'ajouter en bas du fichier :
```typescript
/** Best-effort plain-text extraction from an AttachmentTranscription blob.
 *  Returns undefined if the structure isn't recognized — caller falls back
 *  to the original preview. Used to inline voice-message transcripts in
 *  the push body for Phase A rich notifications. */
function extractTranscriptionText(att: { transcription?: unknown } | null | undefined): string | undefined {
  if (!att?.transcription || typeof att.transcription !== 'object') return undefined;
  const t = att.transcription as Record<string, unknown>;
  if (typeof t.text === 'string' && t.text.trim().length > 0) return t.text.trim();
  if (Array.isArray(t.segments)) {
    const joined = t.segments
      .map(seg => (typeof seg === 'object' && seg && typeof (seg as Record<string, unknown>).text === 'string'
        ? (seg as Record<string, unknown>).text as string
        : ''))
      .join(' ')
      .trim();
    if (joined.length > 0) return joined;
  }
  return undefined;
}
```

- [ ] **Step A.3.4 : Typecheck**

Run : `cd services/gateway && pnpm exec tsc --noEmit 2>&1 | grep -v "sanitize.ts"`
Expected : aucune erreur nouvelle.

- [ ] **Step A.3.5 : Tests unitaires existants doivent toujours passer**

Run : `cd services/gateway && pnpm test src/__tests__/unit/services/messaging --runInBand --coverage=false 2>&1 | tail -10`
Expected : tous passing (47/47 pour MessagingService).

- [ ] **Step A.3.6 : Commit**

```bash
git add services/gateway/src/services/messaging/MessageProcessor.ts
git commit -m "feat(gateway/messaging): inline audio transcript + carry first-attachment URL to notif

In handleMentionsAndNotifications, extract fileUrl/mimeType/duration from the
first attachment of the just-saved message and pass them to
createMessageNotification. For audio attachments with a transcription already
attached (pre-transcribed upload path), use the transcript as the push body so
the recipient sees the text immediately on the lock screen — the audio file is
still attached as a UNNotificationAttachment so they can tap-to-listen without
opening the app."
```

---

### Task A.4 — Test d'intégration end-to-end

**Files:**
- Modify: `services/gateway/src/__tests__/unit/services/NotificationService.test.ts` (ou tests Jest existants ; à adapter selon le fichier le plus pertinent)

- [ ] **Step A.4.1 : Identifier le fichier de tests le plus approprié**

Run : `ls services/gateway/src/__tests__/**/Notification* 2>/dev/null`. Le test `notifications-security.test.ts` couvre la sécurité ; le test des payloads de push est plus probable dans `unit/services/notifications/` ou `__tests__/NotificationService.test.ts`. Si aucun n'a déjà un test pour la création du payload APN avec `imageURL`, créer un nouveau test ciblé.

- [ ] **Step A.4.2 : Écrire un test qui assert la présence des 3 nouveaux champs dans le payload data**

Test minimal (à adapter à la structure des tests existants) — créer `services/gateway/src/__tests__/unit/services/notification-payload-rich-push.test.ts` :

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import { NotificationService } from '../../../services/notifications/NotificationService';

describe('NotificationService rich-push payload (Phase A)', () => {
  it('propagates firstAttachmentUrl / firstAttachmentMimeType / firstAttachmentDurationMs into the APN data payload', async () => {
    // Arrange — minimal Prisma mock returning a sender + conversation.
    const sender = { username: 'alice', displayName: 'Alice', avatar: 'https://meeshy.me/uploads/avatar.jpg' };
    const conversation = { title: 'DM', type: 'direct' };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(sender) },
      conversation: { findUnique: jest.fn().mockResolvedValue(conversation) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const sendToUser = jest.fn().mockResolvedValue([{ success: true, tokenId: 't' }]);
    const pushService = { sendToUser } as any;
    const svc = new NotificationService(prisma, pushService, undefined, undefined);

    // Act
    await svc.createMessageNotification({
      recipientUserId: 'u-bob',
      senderId: 'u-alice',
      messageId: 'm-1',
      conversationId: 'c-1',
      messagePreview: 'Audio voicemail',
      hasAttachments: true,
      attachmentCount: 1,
      firstAttachmentType: 'audio',
      firstAttachmentFilename: 'note.m4a',
      firstAttachmentFileSize: 12345,
      firstAttachmentDuration: 4.5,
      firstAttachmentUrl: 'https://meeshy.me/uploads/note.m4a',
      firstAttachmentMimeType: 'audio/m4a',
    });

    // Assert — the APN payload data must carry the 3 new fields with the correct values.
    expect(sendToUser).toHaveBeenCalledTimes(1);
    const callArgs = sendToUser.mock.calls[0][0];
    expect(callArgs.payload.data.attachmentUrl).toBe('https://meeshy.me/uploads/note.m4a');
    expect(callArgs.payload.data.attachmentMimeType).toBe('audio/m4a');
    expect(callArgs.payload.data.attachmentDurationMs).toBe('4500');
  });

  it('emits empty strings when no attachment is provided', async () => {
    const sender = { username: 'alice', displayName: 'Alice', avatar: '' };
    const conversation = { title: 'DM', type: 'direct' };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(sender) },
      conversation: { findUnique: jest.fn().mockResolvedValue(conversation) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notif-2' }) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const sendToUser = jest.fn().mockResolvedValue([{ success: true, tokenId: 't' }]);
    const pushService = { sendToUser } as any;
    const svc = new NotificationService(prisma, pushService, undefined, undefined);

    await svc.createMessageNotification({
      recipientUserId: 'u-bob',
      senderId: 'u-alice',
      messageId: 'm-2',
      conversationId: 'c-1',
      messagePreview: 'Hello',
    });

    const callArgs = sendToUser.mock.calls[0][0];
    expect(callArgs.payload.data.attachmentUrl).toBe('');
    expect(callArgs.payload.data.attachmentMimeType).toBe('');
    expect(callArgs.payload.data.attachmentDurationMs).toBe('');
  });
});
```

- [ ] **Step A.4.3 : Lancer le test**

Run : `cd services/gateway && pnpm test src/__tests__/unit/services/notification-payload-rich-push.test.ts -- --runInBand --coverage=false`
Expected : 2/2 PASS. Si FAIL parce que les noms de champs internes diffèrent, corriger les tests pour refléter la structure réelle observée dans `createNotification` — ce sont les tests qui doivent suivre l'implémentation, pas l'inverse.

- [ ] **Step A.4.4 : Commit**

```bash
git add services/gateway/src/__tests__/unit/services/notification-payload-rich-push.test.ts
git commit -m "test(gateway/notif): cover rich-push attachment fields in APN payload"
```

---

### Task A.5 — Validation end-to-end manuelle (post-deploy)

- [ ] **Step A.5.1 : Merge Phase A vers main + push**

```bash
git checkout main
git merge --ff-only feat/ios-comm-notifications-phase-A
git push origin main
```

CI build l'image gateway, la prod auto-pull (~5-10 min).

- [ ] **Step A.5.2 : Vérifier l'image prod déployée**

Run :
```bash
ssh root@meeshy.me 'docker inspect $(docker inspect meeshy-gateway --format "{{.Config.Image}}") --format "{{.Created}}" 2>&1'
```
Expected : timestamp ≥ celui du push.

- [ ] **Step A.5.3 : Rebuild + reinstall iOS sur simulateur**

Run : `./apps/ios/meeshy.sh restart`
Expected : Build succeeded + install + launch.

- [ ] **Step A.5.4 : Test : envoyer un message texte d'un compte A vers compte B**

Vérifier dans le banner :
- Avatar de A à gauche
- Petit badge Meeshy en bas-droite de l'avatar
- Nom de A en titre, texte du message en body
- Aucune image attachée (texte simple)

Vérifier au long press : texte du message visible en plus du nom de l'auteur. Aucune image apparente.

- [ ] **Step A.5.5 : Test : envoyer un message image**

Banner compact : avatar à gauche, thumbnail de l'image à droite (slot media).
Long press : preview pleine taille de l'image.

- [ ] **Step A.5.6 : Test : envoyer un message audio**

Banner compact : avatar à gauche, icône audio + durée à droite.
Long press : waveform + bouton play, écoute inline sans ouvrir l'app.

- [ ] **Step A.5.7 : Test : envoyer un message vidéo**

Banner compact : avatar à gauche, thumbnail vidéo à droite.
Long press : preview vidéo, tap-to-play.

- [ ] **Step A.5.8 : Commit + push de la baseline UX**

Si tout passe, le scénario est validé. Sinon : retour Phase 1 (debug), capture des logs gateway pour le payload réellement envoyé + simulator console pour le download URLSession.

---

## Phase B — Reactions (`message_reaction`) [Esquisse]

**Goal** : afficher l'avatar du reactor + l'emoji utilisé. Style "Alice reacted ❤️ to your message".

**Files** :
- `services/gateway/src/services/notifications/NotificationService.ts` — `createReactionNotification` doit propager l'`reactionEmoji` dans `data.reactionEmoji`.
- `apps/ios/MeeshyNotificationExtension/NotificationService.swift` — ajouter `"message_reaction"` à `communicationTypes` (déjà dedans) ; injecter l'emoji dans le body via `bestAttemptContent.body = "\(senderName) reacted \(emoji)..."` AVANT `applyCommunicationIntent`.

**Tasks à dériver** : B.1 propager emoji au payload, B.2 prepend emoji au body côté extension, B.3 test unitaire.

**Estimation** : ~30 lignes de code, 1 commit gateway + 1 commit iOS.

---

## Phase C — Calls APN non-VoIP (`missed_call`, `call_ended`, `call_declined`, `call_recording_ready`) [Esquisse]

**Goal** : afficher l'avatar du caller + icône d'appel (📞 audio, 📹 vidéo) selon le type. Lien deeplink ouvre la conversation au log d'appels.

**Files** :
- `services/gateway/src/services/notifications/NotificationService.ts` — il y a déjà des `createXxxCallNotification` méthodes (vérifier). Ajouter au payload : `callType` (audio/video) et reuse `senderAvatar` qui est déjà là.
- `apps/ios/MeeshyNotificationExtension/NotificationService.swift` — étendre `communicationTypes` pour inclure les call types non-VoIP (ils sont déjà à part).
- VoIP `incoming_call` reste sur le chemin PushKit (`VoIPPushManager.swift`) — pas touché.

**Tasks à dériver** : C.1 emoji prepend selon callType, C.2 vérifier le category iOS `MEESHY_CALL` rend les bons quick actions.

---

## Phase D — Social (`post_like`, `post_comment`, `post_repost`, `story_reaction`, `comment_like`, `comment_reply`) [Esquisse]

**Goal** : avatar de l'auteur de l'action + preview du post/story comme attachment (image thumbnail si post a une image, sinon body texte).

**Files** :
- `services/gateway/src/services/notifications/NotificationService.ts` — pour chaque createXxxNotification social, ajouter `postPreviewImageUrl` (ou `storyPreviewImageUrl`) au payload data en tant que `attachmentUrl` + `attachmentMimeType: 'image/jpeg'`.
- `apps/ios/MeeshyNotificationExtension/NotificationService.swift` — étendre `communicationTypes` pour inclure les types social.

**Tasks à dériver** : D.1 propager preview URL, D.2 valider rendu.

---

## Phase E — Friend requests (`friend_request`, `contact_request`) [Esquisse]

**Goal** : juste valider que l'avatar du requester apparaît correctement (déjà supposé fonctionner depuis Phase A).

**Files** :
- Aucune modif obligatoire si `friend_request` est déjà dans `communicationTypes` côté iOS (à vérifier — actuellement il N'EST PAS dans le set).
- Si pas dedans, ajouter `"friend_request", "contact_request"` au set `Self.communicationTypes` dans `NotificationService.swift`.

**Tasks à dériver** : E.1 ajouter au set, E.2 test manuel.

---

## Self-Review (skim avant exécution)

**1. Spec coverage** :
- Avatar à gauche style WhatsApp → ✓ Phase A.1 + A.2
- Badge Meeshy bas-droite → ✓ comportement natif iOS quand INSendMessageIntent appliqué, pas de code spécifique requis
- Media du message visible dans la notif → ✓ Phase A.1 nouveau `attachmentUrl` + UTI typeHint
- Lecture inline OS supportée → ✓ géré par iOS via UNNotificationAttachment + typeHint (audio waveform, video tap-to-play, image preview)
- "audio video ou image" attaché → ✓ Phase A couvre les 3 via `fileHints()`
- Reactions/calls/social → ✓ Phases B-E esquissées

**2. Placeholder scan** :
- Pas de TBD, TODO, "implement later" dans le code des Steps Phase A.
- Phases B-E sont explicitement marquées comme esquisses à dériver ; pas un placeholder, juste un découpage volontaire post-A.

**3. Type consistency** :
- `firstAttachmentUrl` / `firstAttachmentMimeType` / `firstAttachmentDurationMs` (gateway) → `attachmentUrl` / `attachmentMimeType` / `attachmentDurationMs` (payload `data`) → mêmes valeurs lues par l'extension iOS. ✓
- `INPerson.image` reçoit `INImage(imageData: avatarData)` — `avatarData` est `Data?` partout. ✓
- `extractTranscriptionText` retourne `string | undefined`, utilisé dans `??` chain. ✓

Fix immédiat avant exécution : aucun.
