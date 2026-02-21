# API Data Models Reference

Documentation des structures de donnees retournees par le gateway et leur mapping vers les modeles domain iOS.

## Endpoints

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `GET /conversations` | GET | Liste des conversations de l'utilisateur |
| `GET /conversations/:id/messages` | GET | Messages d'une conversation |
| `POST /conversations/:id/messages` | POST | Envoyer un message |

## Conversations

### GET /conversations

**Response wrapper:**
```json
{ "success": true, "data": [APIConversation], "pagination": { "total", "page", "limit", "totalPages" } }
```

### APIConversation (SDK: `ConversationModels.swift`)

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ObjectId MongoDB (24-char hex) |
| `type` | `String` | non | `"direct"`, `"dm"`, `"group"`, `"community"`, `"channel"`, `"public"`, `"global"`, `"bot"` |
| `identifier` | `String?` | oui | Identifiant unique lisible (slug) |
| `title` | `String?` | oui | Nom de la conversation (ATTENTION: le gateway envoie `title`, PAS `name`) |
| `description` | `String?` | oui | Description de la conversation |
| `avatar` | `String?` | oui | URL avatar de la conversation (groupes/channels) |
| `banner` | `String?` | oui | URL banniere |
| `communityId` | `String?` | oui | ID de la communaute parente |
| `isActive` | `Bool?` | oui | Conversation active (defaut: true) |
| `memberCount` | `Int?` | oui | Nombre de membres |
| `lastMessageAt` | `Date?` | oui | Date du dernier message (ISO8601) |
| `members` | `[APIConversationMember]?` | oui | Liste des membres avec details utilisateur |
| `lastMessage` | `APIConversationLastMessage?` | oui | Dernier message (remapping gateway: `messages[0]` -> `lastMessage`) |
| `userPreferences` | `[APIConversationPreferences]?` | oui | Preferences utilisateur (pin, mute, tags) |
| `unreadCount` | `Int?` | oui | Nombre de messages non lus |
| `updatedAt` | `Date?` | oui | Date de mise a jour |
| `createdAt` | `Date` | non | Date de creation |

### APIConversationMember

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `userId` | `String` | non | ID de l'utilisateur |
| `role` | `String?` | oui | Role dans la conversation |
| `user` | `APIConversationUser?` | oui | Details de l'utilisateur |

### APIConversationUser

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID utilisateur |
| `username` | `String` | non | Nom d'utilisateur |
| `displayName` | `String?` | oui | Nom d'affichage |
| `firstName` | `String?` | oui | Prenom |
| `lastName` | `String?` | oui | Nom |
| `avatar` | `String?` | oui | URL avatar (champ principal) |
| `avatarUrl` | `String?` | oui | URL avatar (champ alternatif) |
| `isOnline` | `Bool?` | oui | Statut en ligne |
| `lastActiveAt` | `Date?` | oui | Derniere activite |

Proprietes calculees:
- `name: String` -> `displayName ?? username`
- `resolvedAvatar: String?` -> `avatar ?? avatarUrl`

### APIConversationLastMessage

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID du message |
| `content` | `String?` | oui | Contenu texte |
| `senderId` | `String?` | oui | ID de l'expediteur |
| `createdAt` | `Date` | non | Date de creation |

### APIConversationPreferences

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `isPinned` | `Bool?` | oui | Conversation epinglee |
| `isMuted` | `Bool?` | oui | Notifications muettes |
| `isArchived` | `Bool?` | oui | Conversation archivee |
| `isDeletedForUser` | `Bool?` | oui | Supprimee pour cet utilisateur |
| `tags` | `[String]?` | oui | Noms des tags (convertis en MeeshyConversationTag) |
| `categoryId` | `String?` | oui | ID de categorie |

### Conversion: APIConversation -> MeeshyConversation

Logique dans `APIConversation.toConversation(currentUserId:)`:

1. **Type**: `type.lowercased()` mappe vers `ConversationType` enum (`"direct"/"dm"` -> `.direct`, `"group"` -> `.group`, etc.)
2. **Titre**: Pour DM, utilise `otherUser.name`; sinon utilise `title`; fallback `"Conversation"`
3. **Avatar**: Pour DM, utilise `otherUser.resolvedAvatar`; pour groupes, utilise `avatar` de la conversation
4. **unreadCount**: Lu directement depuis l'API (defaut: 0)
5. **Tags**: Convertis depuis `userPreferences.first.tags` avec couleurs cycliques
6. **isPinned/isMuted**: Lu depuis `userPreferences.first`
7. **lastMessageAt**: `lastMessageAt ?? lastMessage.createdAt ?? createdAt`

## Messages

### GET /conversations/:id/messages

**Query params:** `?limit=50&offset=0&include_replies=true`

**Response wrapper:**
```json
{ "success": true, "data": [APIMessage], "pagination": { "total", "limit", "offset", "hasMore" } }
```

### APIMessage (SDK: `MessageModels.swift`)

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ObjectId MongoDB |
| `conversationId` | `String` | non | ID de la conversation |
| `senderId` | `String?` | oui | ID de l'expediteur |
| `anonymousSenderId` | `String?` | oui | ID session anonyme |
| `content` | `String?` | oui | Contenu texte du message |
| `originalLanguage` | `String?` | oui | Code langue original (ex: `"fr"`) |
| `messageType` | `String?` | oui | `"text"`, `"image"`, `"file"`, `"audio"`, `"video"`, `"location"` |
| `messageSource` | `String?` | oui | `"user"`, `"system"`, `"ads"`, `"app"`, `"agent"`, `"authority"` |
| `isEdited` | `Bool?` | oui | Message modifie |
| `isDeleted` | `Bool?` | oui | Message supprime |
| `replyToId` | `String?` | oui | ID du message auquel on repond |
| `forwardedFromId` | `String?` | oui | ID du message original transfere |
| `forwardedFromConversationId` | `String?` | oui | ID conversation source du transfert |
| `pinnedAt` | `String?` | oui | Date d'epinglage (ISO8601 string, PAS Date) |
| `pinnedBy` | `String?` | oui | ID de l'utilisateur qui a epingle |
| `isViewOnce` | `Bool?` | oui | Message a lecture unique |
| `isBlurred` | `Bool?` | oui | Contenu floute |
| `isEncrypted` | `Bool?` | oui | Message chiffre |
| `encryptionMode` | `String?` | oui | Mode de chiffrement |
| `createdAt` | `Date` | non | Date de creation (ISO8601) |
| `updatedAt` | `Date?` | oui | Date de mise a jour |
| `sender` | `APIMessageSender?` | oui | Details de l'expediteur |
| `attachments` | `[APIMessageAttachment]?` | oui | Pieces jointes |
| `replyTo` | `APIMessageReplyTo?` | oui | Message auquel on repond (enrichi) |
| `forwardedFrom` | `APIForwardedFrom?` | oui | Message original transfere (enrichi) |
| `forwardedFromConversation` | `APIForwardedFromConversation?` | oui | Conversation source du transfert |
| `reactionSummary` | `[String: Int]?` | oui | Compteur par emoji (ex: `{"thumbsup": 3}`) |
| `reactionCount` | `Int?` | oui | Total reactions |
| `currentUserReactions` | `[String]?` | oui | Emojis de l'utilisateur courant |

### APIMessageSender

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID utilisateur |
| `username` | `String` | non | Nom d'utilisateur |
| `displayName` | `String?` | oui | Nom d'affichage |
| `avatar` | `String?` | oui | URL avatar |

### APIMessageAttachment

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID de la piece jointe |
| `fileName` | `String?` | oui | Nom du fichier |
| `originalName` | `String?` | oui | Nom original |
| `mimeType` | `String?` | oui | Type MIME (`image/jpeg`, `video/mp4`, `audio/mpeg`, etc.) |
| `fileSize` | `Int?` | oui | Taille en octets |
| `fileUrl` | `String?` | oui | URL du fichier |
| `thumbnailUrl` | `String?` | oui | URL de la miniature |
| `width` | `Int?` | oui | Largeur (images/videos) |
| `height` | `Int?` | oui | Hauteur (images/videos) |
| `duration` | `Int?` | oui | Duree en millisecondes (audio/video) |
| `latitude` | `Double?` | oui | Latitude (locations) - NOTE: pas encore dans le schema Prisma |
| `longitude` | `Double?` | oui | Longitude (locations) - NOTE: pas encore dans le schema Prisma |

### APIMessageReplyTo

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID du message original |
| `content` | `String?` | oui | Contenu texte |
| `senderId` | `String?` | oui | ID de l'expediteur |
| `sender` | `APIMessageSender?` | oui | Details expediteur (enrichi par le gateway) |
| `attachments` | `[APIMessageAttachment]?` | oui | Pieces jointes du message original |

### APIForwardedFrom

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID du message original transfere |
| `content` | `String?` | oui | Contenu texte |
| `messageType` | `String?` | oui | Type du message original |
| `createdAt` | `Date?` | oui | Date du message original |
| `sender` | `APIMessageSender?` | oui | Expediteur original |
| `attachments` | `[APIMessageAttachment]?` | oui | Pieces jointes originales |

### APIForwardedFromConversation

| Champ JSON | Type Swift | Nullable | Description |
|------------|-----------|----------|-------------|
| `id` | `String` | non | ID de la conversation source |
| `title` | `String?` | oui | Titre de la conversation source |
| `identifier` | `String?` | oui | Identifiant lisible |
| `type` | `String?` | oui | Type de conversation |
| `avatar` | `String?` | oui | Avatar de la conversation source |

### Conversion: APIMessage -> MeeshyMessage

Logique dans `APIMessage.toMessage(currentUserId:)`:

1. **messageType**: `messageType.lowercased()` mappe vers `MessageType` enum
2. **messageSource**: `messageSource.lowercased()` mappe vers `MessageSource` enum
3. **attachments**: Chaque `APIMessageAttachment` -> `MeeshyMessageAttachment` avec `thumbnailColor` genere depuis le username
4. **reactions**: `reactionSummary` (dict) -> tableau de `MeeshyReaction` (une entree par emoji * count)
5. **replyTo**: `APIMessageReplyTo` -> `ReplyReference` avec premier attachment mimeType/thumbnailUrl
6. **forwardedFrom**: `APIForwardedFrom` + `APIForwardedFromConversation` -> `ForwardReference`
7. **pinnedAt**: Parse depuis String ISO8601 vers Date (le gateway envoie un string, pas un Date)
8. **senderName**: `sender.displayName ?? sender.username`
9. **senderColor**: Genere via `DynamicColorGenerator.colorForName(senderName)`
10. **isMe**: `senderId == currentUserId`

### SendMessageRequest (Encodable)

| Champ JSON | Type Swift | Description |
|------------|-----------|-------------|
| `content` | `String?` | Contenu du message |
| `originalLanguage` | `String?` | Code langue |
| `replyToId` | `String?` | ID message repondu |
| `forwardedFromId` | `String?` | ID message transfere |
| `forwardedFromConversationId` | `String?` | ID conversation source |
| `attachmentIds` | `[String]?` | IDs des pieces jointes uploadees |

## Response Wrappers

### OffsetPagination (SDK: `CoreModels.swift` ou equivalent)

```json
{ "total": 150, "limit": 50, "offset": 0, "hasMore": true }
```

### Page-based Pagination (conversations)

```json
{ "total": 25, "page": 1, "limit": 20, "totalPages": 2 }
```

## Domain Models (CoreModels.swift)

Les types domain portent le prefixe `Meeshy`:

| API Layer | Domain Layer |
|-----------|-------------|
| `APIConversation` | `MeeshyConversation` |
| `APIMessage` | `MeeshyMessage` |
| `APIMessageAttachment` | `MeeshyMessageAttachment` |
| n/a (dict flattened) | `MeeshyReaction` |
| n/a (from prefs.tags) | `MeeshyConversationTag` |
| `APIMessageReplyTo` | `ReplyReference` |
| `APIForwardedFrom` + `APIForwardedFromConversation` | `ForwardReference` |
| `APIMessageSender` | Flattened into `MeeshyMessage.senderName`, `.senderColor`, `.senderAvatarURL` |

## Notes importantes

1. **Dates**: Le gateway encode toutes les dates en ISO8601 avec secondes fractionnaires. L'`APIClient` du SDK utilise un `JSONDecoder` avec `.iso8601` strategy.
2. **pinnedAt exception**: Le champ `pinnedAt` dans `APIMessage` est un `String?` (pas un `Date?`) car certaines reponses le renvoient comme string brut. La conversion en `Date` se fait dans `toMessage()`.
3. **latitude/longitude**: Declares dans `APIMessageAttachment` et `MeeshyMessageAttachment` mais PAS encore dans le schema Prisma du backend. Les valeurs seront toujours `nil` tant que le schema n'est pas mis a jour.
4. **reactionSummary vs reactions**: Le gateway envoie un dict `{ emoji: count }`. La conversion cree N objets `MeeshyReaction` (un par emoji * count). L'information `userId` est perdue dans cette conversion.
5. **currentUserReactions**: Tableau des emojis que l'utilisateur courant a ajoutes. Decode dans `APIMessage` mais pas encore utilise dans la conversion `toMessage()` pour marquer `includesMe` dans les reactions.
6. **avatar resolution**: Pour les DM, l'avatar affiche est celui de l'autre participant (`otherUser.resolvedAvatar`). Pour les groupes/channels, c'est l'avatar de la conversation elle-meme.
7. **Gateway enrichment**: Le gateway enrichit automatiquement `replyTo` (avec sender + attachments) et `forwardedFrom` (avec sender + attachments + conversation source). Ces donnees enrichies ne sont pas dans la DB Prisma mais ajoutees au runtime par le gateway.
