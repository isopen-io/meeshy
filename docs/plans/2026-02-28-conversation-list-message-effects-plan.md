# Conversation List — Message Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Appliquer les effets du dernier message (flou, éphémère, view-once) dans la preview de la liste des conversations, et masquer le contenu des messages expirés.

**Architecture:** Pipeline en 3 couches — Gateway expose les champs d'effet, le SDK les mappe dans `MeeshyConversation`, la vue `ThemedConversationRow` les affiche avec le rendu approprié.

**Tech Stack:** TypeScript/Prisma (gateway), Swift/MeeshySDK (modèles), SwiftUI (vue iOS)

---

### Task 1 : Gateway — Exposer les champs d'effet dans lastMessage

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts`

**Context:**
Le query Prisma qui récupère le dernier message de chaque conversation (ligne ~302-343) ne sélectionne pas `isBlurred`, `isViewOnce`, ni `expiresAt`. Il faut les ajouter au select.

**Step 1 : Localiser le bloc `messages` dans le select Prisma**

Ouvrir `services/gateway/src/routes/conversations/core.ts`. Chercher le bloc :
```typescript
messages: {
  where: {
    isDeleted: false
  },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: {
    id: true,
    content: true,
    createdAt: true,
    senderId: true,
    messageType: true,
```

**Step 2 : Ajouter les 3 champs après `messageType: true`**

```typescript
    messageType: true,
    isBlurred: true,
    isViewOnce: true,
    expiresAt: true,
    sender: {
```

**Step 3 : Vérifier que le build TypeScript passe**

```bash
cd services/gateway
npx tsc --noEmit
```

Expected: no errors (les champs existent dans le schéma Prisma de `Message`).

**Step 4 : Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts
git commit -m "feat(gateway): expose isBlurred, isViewOnce, expiresAt in conversation lastMessage"
```

---

### Task 2 : SDK — Ajouter les champs à `APIConversationLastMessage`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`

**Context:**
`APIConversationLastMessage` est le struct Decodable qui mappe le JSON `lastMessage` de l'API. Il faut y ajouter les 3 nouveaux champs optionnels. Ils sont optionnels (`Bool?`, `Date?`) pour compatibilité si le gateway ne les envoie pas encore.

**Step 1 : Ajouter les propriétés à `APIConversationLastMessage`**

Trouver le struct (lignes ~24-38). Après `let _count: APIMessageCount?`, ajouter avant le `enum CodingKeys` :

```swift
public let isBlurred: Bool?
public let isViewOnce: Bool?
public let expiresAt: Date?
```

**Step 2 : Mettre à jour le `CodingKeys` enum**

Le `CodingKeys` actuel :
```swift
enum CodingKeys: String, CodingKey {
    case id, content, senderId, createdAt, messageType, sender, attachments
    case _count
}
```

Remplacer par :
```swift
enum CodingKeys: String, CodingKey {
    case id, content, senderId, createdAt, messageType, sender, attachments
    case _count
    case isBlurred, isViewOnce, expiresAt
}
```

**Step 3 : Vérifier que le SDK compile**

```bash
cd packages/MeeshySDK
swift build 2>&1 | head -30
```

Expected: `Build complete!`

**Step 4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift
git commit -m "feat(sdk): add isBlurred, isViewOnce, expiresAt to APIConversationLastMessage"
```

---

### Task 3 : SDK — Ajouter les champs à `MeeshyConversation`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`

**Context:**
`MeeshyConversation` est le modèle domain utilisé par l'app iOS. Il faut y ajouter les 3 champs d'effet du dernier message, puis mettre à jour `toConversation()` et l'`init`.

**Step 1 : Ajouter les propriétés à `MeeshyConversation`**

Dans `CoreModels.swift`, dans le struct `MeeshyConversation`, après `public var lastMessageSenderName: String? = nil`, ajouter :

```swift
public var lastMessageIsBlurred: Bool = false
public var lastMessageIsViewOnce: Bool = false
public var lastMessageExpiresAt: Date? = nil
```

**Step 2 : Ajouter les paramètres à l'`init`**

Dans la signature de `public init(...)`, après `lastMessageSenderName: String? = nil,`, ajouter :

```swift
lastMessageIsBlurred: Bool = false,
lastMessageIsViewOnce: Bool = false,
lastMessageExpiresAt: Date? = nil,
```

Et dans le corps de l'init, après `self.lastMessageSenderName = lastMessageSenderName`, ajouter :

```swift
self.lastMessageIsBlurred = lastMessageIsBlurred
self.lastMessageIsViewOnce = lastMessageIsViewOnce
self.lastMessageExpiresAt = lastMessageExpiresAt
```

**Step 3 : Mettre à jour `APIConversation.toConversation()` dans `ConversationModels.swift`**

Dans l'appel `return MeeshyConversation(...)`, après `lastMessageSenderName: lastMsgSenderName,`, ajouter :

```swift
lastMessageIsBlurred: lastMessage?.isBlurred ?? false,
lastMessageIsViewOnce: lastMessage?.isViewOnce ?? false,
lastMessageExpiresAt: lastMessage?.expiresAt,
```

**Step 4 : Vérifier que le SDK compile**

```bash
cd packages/MeeshySDK
swift build 2>&1 | head -30
```

Expected: `Build complete!`

**Step 5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift
git commit -m "feat(sdk): propagate message effects (isBlurred, isViewOnce, expiresAt) to MeeshyConversation"
```

---

### Task 4 : iOS Vue — Appliquer les effets dans `lastMessagePreviewView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

**Context:**
`ThemedConversationRow.lastMessagePreviewView` (lignes ~300-335) est le `@ViewBuilder` qui affiche le preview du dernier message. Il faut le modifier pour gérer les 4 cas d'effet avant d'afficher le contenu normal.

**Step 1 : Ajouter la computed property `lastMessageEffectState`**

Après la computed property `visibleTagsInfo` et avant `var body`, ajouter :

```swift
// MARK: - Last Message Effect State

private enum LastMessageEffect {
    case expired
    case blurred
    case viewOnce
    case ephemeralActive
    case none
}

private var lastMessageEffect: LastMessageEffect {
    if let expiresAt = conversation.lastMessageExpiresAt, expiresAt <= Date() {
        return .expired
    }
    if conversation.lastMessageIsBlurred {
        return .blurred
    }
    if conversation.lastMessageIsViewOnce {
        return .viewOnce
    }
    if let expiresAt = conversation.lastMessageExpiresAt, expiresAt > Date() {
        return .ephemeralActive
    }
    return .none
}
```

**Step 2 : Remplacer `lastMessagePreviewView`**

Remplacer entièrement le `@ViewBuilder private var lastMessagePreviewView` existant (lignes ~300-335) par :

```swift
// MARK: - Last Message Preview

@ViewBuilder
private var lastMessagePreviewView: some View {
    switch lastMessageEffect {
    case .expired:
        HStack(spacing: 4) {
            Image(systemName: "timer.badge.xmark")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(textMuted)
            Text(String(localized: "message.expired", defaultValue: "Message expiré"))
                .font(.system(size: 13).italic())
                .foregroundColor(textMuted)
                .lineLimit(1)
        }

    case .blurred:
        HStack(spacing: 4) {
            senderLabel
            Image(systemName: "eye.slash")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(textSecondary)
            Text(conversation.lastMessagePreview ?? "")
                .font(.system(size: 13))
                .foregroundColor(textSecondary)
                .lineLimit(1)
                .blur(radius: 4)
        }

    case .viewOnce:
        HStack(spacing: 4) {
            senderLabel
            Image(systemName: "flame")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
            Text(String(localized: "message.view_once", defaultValue: "Voir une fois"))
                .font(.system(size: 13))
                .foregroundColor(Color(hex: accentColor))
                .lineLimit(1)
        }

    case .ephemeralActive:
        let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount
        HStack(spacing: 4) {
            Image(systemName: "timer")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
            senderLabel
            if !hasText && !attachments.isEmpty {
                let att = attachments[0]
                attachmentIcon(for: att.mimeType)
                attachmentMeta(for: att)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
            } else if hasText {
                if !attachments.isEmpty {
                    attachmentIcon(for: attachments[0].mimeType)
                        .font(.system(size: 11))
                }
                Text(conversation.lastMessagePreview ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }

    case .none:
        let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount
        if !hasText && !attachments.isEmpty {
            HStack(spacing: 4) {
                senderLabel
                let att = attachments[0]
                attachmentIcon(for: att.mimeType)
                attachmentMeta(for: att)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        } else if hasText {
            HStack(spacing: 4) {
                senderLabel
                if !attachments.isEmpty {
                    attachmentIcon(for: attachments[0].mimeType)
                        .font(.system(size: 11))
                }
                Text(conversation.lastMessagePreview ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        } else {
            Text("")
                .font(.system(size: 13))
                .foregroundColor(textSecondary)
        }
    }
}
```

**Step 3 : Vérifier que l'app compile**

```bash
./apps/ios/meeshy.sh build
```

Expected: `** BUILD SUCCEEDED **`

**Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
git commit -m "feat(ios): apply message effects (blur/expired/view-once/ephemeral) in conversation list preview"
```

---

### Task 5 : Vérification visuelle

**Step 1 : Lancer l'app sur le simulateur**

```bash
./apps/ios/meeshy.sh run
```

**Step 2 : Vérifier chaque cas manuellement**

Ouvrir la liste des conversations et vérifier :
- [ ] Conversation avec un message normal → preview inchangée
- [ ] Conversation avec `isBlurred = true` → texte flouté, icône `eye.slash`
- [ ] Conversation avec `isViewOnce = true` → "Voir une fois" + icône flamme
- [ ] Conversation avec `expiresAt > now` → icône ⏱ en préfixe
- [ ] Conversation avec `expiresAt <= now` → "Message expiré" grisé italique, sans attachement

**Step 3 : Commit final si ajustements UI**

```bash
git add -p
git commit -m "fix(ios): adjust message effects rendering in conversation list"
```
