# API REST - Documentation Complète

Guide complet d'intégration avec l'API REST Meeshy.

---

## Configuration

### Endpoints par Environnement

| Environnement | Base URL | Usage |
|---------------|----------|-------|
| **Development** | `http://localhost:3000` ou `https://dev.gate.meeshy.me` | Développement local |
| **Staging** | `https://staging.gate.meeshy.me` | Tests pré-production |
| **Production** | `https://gate.meeshy.me` | App Store |

### Configuration dans l'App

```swift
// Configuration automatique selon le scheme Xcode
let apiURL = EnvironmentConfig.shared.apiBaseURL

// Debug: http://localhost:3000
// Staging: https://staging.gate.meeshy.me
// Production: https://gate.meeshy.me
```

---

## Authentification

Toutes les requêtes authentifiées nécessitent un JWT dans le header:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Token Management

```swift
// Stockage sécurisé dans Keychain
KeychainService.shared.saveAccessToken(token)
KeychainService.shared.saveRefreshToken(refreshToken)

// Récupération
let token = KeychainService.shared.getAccessToken()

// Refresh automatique sur 401
APIService.shared.refreshTokenIfNeeded()
```

---

## Endpoints

### 🔐 Authentication

#### POST /api/auth/login

**Description:** Connexion utilisateur

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "deviceId": "unique-device-id"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "username": "johndoe",
      "displayName": "John Doe",
      "firstName": "John",
      "lastName": "Doe",
      "avatarUrl": "https://...",
      "bio": "Hello world!",
      "language": "en",
      "twoFactorEnabled": false,
      "biometricEnabled": true,
      "createdAt": "2025-01-15T10:00:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 3600
    }
  }
}
```

**Error 401:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid credentials"
  }
}
```

**Swift Implementation:**
```swift
struct LoginRequest: Codable {
    let email: String
    let password: String
    let deviceId: String
}

struct LoginResponse: Codable {
    let user: User
    let tokens: Tokens
}

func login(email: String, password: String) async throws -> LoginResponse {
    let request = LoginRequest(
        email: email,
        password: password,
        deviceId: UUID().uuidString
    )

    return try await APIService.shared.post(
        EnvironmentConfig.Endpoint.login,
        body: request
    )
}
```

---

#### POST /api/auth/register

**Description:** Inscription nouvel utilisateur

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "username": "newuser",
  "displayName": "New User",
  "firstName": "New",
  "lastName": "User",
  "language": "en"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { /* User object */ },
    "tokens": { /* Tokens object */ }
  }
}
```

**Errors:**
- `400` - Validation error (email exists, weak password)
- `409` - Username already taken

---

#### POST /api/auth/refresh

**Description:** Rafraîchir le token d'accès

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "expiresIn": 3600
  }
}
```

---

#### POST /api/auth/logout

**Description:** Déconnexion

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### POST /api/auth/enable-2fa

**Description:** Activer l'authentification à deux facteurs

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,...",
    "secret": "SECRET_KEY_HERE"
  }
}
```

---

#### POST /api/auth/verify-2fa

**Description:** Vérifier le code 2FA

**Request:**
```json
{
  "code": "123456"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": { /* User object with 2FA enabled */ },
    "tokens": { /* New tokens */ }
  }
}
```

---

### 👤 Users

#### GET /api/users/profile

**Description:** Récupérer le profil utilisateur connecté

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "avatarUrl": "https://...",
    "bio": "My bio",
    "language": "en",
    "phoneNumber": "+1234567890",
    "twoFactorEnabled": true,
    "biometricEnabled": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-20T15:30:00Z"
  }
}
```

---

#### PUT /api/users/profile/update

**Description:** Mettre à jour le profil

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "displayName": "John Smith",
  "firstName": "John",
  "lastName": "Smith",
  "bio": "Updated bio",
  "language": "fr"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { /* Updated user object */ }
}
```

**Note:** `username`, `email`, `phoneNumber` ne peuvent PAS être modifiés via cet endpoint (procédures sécurisées séparées).

---

#### POST /api/users/avatar

**Description:** Upload avatar utilisateur

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: Image file (JPG, PNG, max 5MB)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "avatarUrl": "https://meeshy-user-attachments-v1.s3.amazonaws.com/avatars/user_123.jpg"
  }
}
```

**Swift Implementation:**
```swift
func uploadAvatar(image: UIImage) async throws -> String {
    guard let imageData = image.jpegData(compressionQuality: 0.8) else {
        throw APIError.invalidImage
    }

    let response: AvatarUploadResponse = try await APIService.shared.upload(
        EnvironmentConfig.Endpoint.uploadAvatar,
        data: imageData,
        filename: "avatar.jpg",
        mimeType: "image/jpeg"
    )

    return response.avatarUrl
}
```

---

#### GET /api/users/search

**Description:** Rechercher des utilisateurs

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `query` (required): Terme de recherche
- `limit` (optional): Nombre de résultats (default: 20)
- `offset` (optional): Pagination (default: 0)

**Example:** `/api/users/search?query=john&limit=10`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_123",
        "username": "johndoe",
        "displayName": "John Doe",
        "avatarUrl": "https://...",
        "bio": "My bio"
      }
    ],
    "total": 1,
    "hasMore": false
  }
}
```

---

### 💬 Conversations

#### GET /api/conversations

**Description:** Liste des conversations

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Nombre de conversations (default: 50)
- `offset` (optional): Pagination (default: 0)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_123",
        "type": "direct",
        "name": "John Doe",
        "avatarUrl": "https://...",
        "participants": [
          {
            "id": "user_123",
            "username": "johndoe",
            "displayName": "John Doe",
            "avatarUrl": "https://..."
          }
        ],
        "lastMessage": {
          "id": "msg_456",
          "content": "Hello!",
          "senderId": "user_123",
          "timestamp": "2025-01-20T15:30:00Z"
        },
        "unreadCount": 3,
        "isMuted": false,
        "isPinned": false,
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-20T15:30:00Z"
      }
    ],
    "total": 1,
    "hasMore": false
  }
}
```

---

#### POST /api/conversations/create

**Description:** Créer une conversation

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "type": "direct",
  "participantIds": ["user_456"],
  "name": "My Group Chat"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": { /* Conversation object */ }
}
```

---

#### GET /api/conversations/:id

**Description:** Détails d'une conversation

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": { /* Full conversation object */ }
}
```

---

#### GET /api/conversations/:id/messages

**Description:** Messages d'une conversation

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Nombre de messages (default: 50)
- `before` (optional): Timestamp pour pagination

**Response 200:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_123",
        "conversationId": "conv_123",
        "senderId": "user_123",
        "content": "Hello!",
        "type": "text",
        "attachments": [],
        "translations": {
          "fr": "Bonjour!",
          "es": "¡Hola!"
        },
        "readBy": ["user_456"],
        "editedAt": null,
        "deletedAt": null,
        "createdAt": "2025-01-20T15:30:00Z"
      }
    ],
    "hasMore": false
  }
}
```

---

#### PUT /api/conversations/:id

**Description:** Mettre à jour une conversation

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "New Group Name",
  "isMuted": true,
  "isPinned": false
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { /* Updated conversation */ }
}
```

---

#### DELETE /api/conversations/:id

**Description:** Supprimer une conversation

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "message": "Conversation deleted"
}
```

---

### 📨 Messages

#### POST /api/messages/send

**Description:** Envoyer un message

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "conversationId": "conv_123",
  "content": "Hello!",
  "type": "text",
  "attachments": []
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "msg_789",
    "conversationId": "conv_123",
    "senderId": "user_123",
    "content": "Hello!",
    "type": "text",
    "attachments": [],
    "translations": {},
    "readBy": [],
    "createdAt": "2025-01-20T15:35:00Z"
  }
}
```

**Swift Implementation:**
```swift
func sendMessage(conversationId: String, content: String) async throws -> Message {
    let request = SendMessageRequest(
        conversationId: conversationId,
        content: content,
        type: .text,
        attachments: []
    )

    let response: MessageResponse = try await APIService.shared.post(
        EnvironmentConfig.Endpoint.sendMessage,
        body: request
    )

    return response.data
}
```

---

#### PUT /api/messages/:id/edit

**Description:** Éditer un message

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "content": "Updated message content"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { /* Updated message */ }
}
```

---

#### DELETE /api/messages/:id

**Description:** Supprimer un message

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "message": "Message deleted"
}
```

---

#### POST /api/messages/:id/read

**Description:** Marquer un message comme lu

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": { /* Updated message with readBy */ }
}
```

---

### 📎 Attachments

#### POST /api/attachments/upload

**Description:** Upload fichier (image, vidéo, document)

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: File (max 100MB)
- `conversationId`: Conversation ID
- `type`: "image" | "video" | "audio" | "file"

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "att_123",
    "url": "https://meeshy-user-attachments-v1.s3.amazonaws.com/...",
    "thumbnailUrl": "https://...",
    "type": "image",
    "mimeType": "image/jpeg",
    "size": 1024000,
    "width": 1920,
    "height": 1080,
    "duration": null
  }
}
```

---

#### GET /api/attachments/:id

**Description:** Récupérer un attachement

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": { /* Attachment object */ }
}
```

---

### 🌍 Translation

#### POST /api/translation/translate

**Description:** Traduire un texte

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "text": "Hello, how are you?",
  "targetLanguage": "fr",
  "sourceLanguage": "en"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "translatedText": "Bonjour, comment allez-vous?",
    "sourceLanguage": "en",
    "targetLanguage": "fr",
    "confidence": 0.99
  }
}
```

---

#### POST /api/translation/detect

**Description:** Détecter la langue d'un texte

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "text": "Hello, how are you?"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "language": "en",
    "confidence": 0.99
  }
}
```

---

### 🔔 Notifications

#### GET /api/notifications

**Description:** Liste des notifications

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): default 50
- `offset` (optional): default 0

**Response 200:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_123",
        "type": "message",
        "title": "New message from John",
        "body": "Hello!",
        "data": {
          "conversationId": "conv_123",
          "messageId": "msg_456"
        },
        "isRead": false,
        "createdAt": "2025-01-20T15:30:00Z"
      }
    ],
    "unreadCount": 5,
    "hasMore": false
  }
}
```

---

#### POST /api/notifications/register-device

**Description:** Enregistrer le device pour push notifications

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "deviceToken": "apns-device-token-here",
  "platform": "ios",
  "deviceId": "unique-device-id"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Device registered"
}
```

---

#### PUT /api/notifications/:id/read

**Description:** Marquer notification comme lue

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": { /* Updated notification */ }
}
```

---

### 📞 Calls

#### POST /api/calls/initiate

**Description:** Initier un appel

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "conversationId": "conv_123",
  "type": "video"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "call_123",
    "conversationId": "conv_123",
    "initiatorId": "user_123",
    "type": "video",
    "status": "ringing",
    "participants": [],
    "startedAt": "2025-01-20T15:40:00Z"
  }
}
```

---

#### PUT /api/calls/:id/end

**Description:** Terminer un appel

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "call_123",
    "status": "ended",
    "duration": 300,
    "endedAt": "2025-01-20T15:45:00Z"
  }
}
```

---

#### GET /api/calls/:id/status

**Description:** Status d'un appel

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "call_123",
    "status": "ongoing",
    "participants": [
      {
        "userId": "user_123",
        "isVideoEnabled": true,
        "isAudioEnabled": true
      }
    ]
  }
}
```

---

## Codes d'Erreur

| Code HTTP | Error Code | Description |
|-----------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Données invalides |
| 401 | `AUTH_FAILED` | Authentification échouée |
| 401 | `TOKEN_EXPIRED` | Token expiré |
| 403 | `UNAUTHORIZED` | Accès non autorisé |
| 404 | `NOT_FOUND` | Ressource non trouvée |
| 409 | `CONFLICT` | Conflit (ex: username exists) |
| 429 | `RATE_LIMIT_EXCEEDED` | Trop de requêtes |
| 500 | `SERVER_ERROR` | Erreur serveur |

---

## Best Practices

### 1. Gestion des Erreurs

```swift
do {
    let response = try await APIService.shared.get("/api/users/profile")
    // Success
} catch APIError.unauthorized {
    // Token expired, refresh it
    await AuthService.shared.refreshToken()
} catch APIError.networkError {
    // Show offline message
    showOfflineAlert()
} catch {
    // Generic error
    showError(error.localizedDescription)
}
```

### 2. Retry Logic

```swift
func fetchWithRetry<T>(
    _ request: @escaping () async throws -> T,
    maxAttempts: Int = 3
) async throws -> T {
    var attempt = 0

    while attempt < maxAttempts {
        do {
            return try await request()
        } catch {
            attempt += 1
            if attempt >= maxAttempts { throw error }
            try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt))) * 1_000_000_000)
        }
    }

    throw APIError.maxRetriesExceeded
}
```

### 3. Request Cancellation

```swift
class ChatViewModel {
    private var loadTask: Task<Void, Never>?

    func loadMessages() {
        loadTask?.cancel()
        loadTask = Task {
            await fetchMessages()
        }
    }

    deinit {
        loadTask?.cancel()
    }
}
```

---

## Pagination

Les endpoints de liste supportent la pagination:

```swift
// First page
let response = try await APIService.shared.get("/api/conversations?limit=20&offset=0")

// Next page
let response = try await APIService.shared.get("/api/conversations?limit=20&offset=20")

// Check if more
if response.hasMore {
    // Load more
}
```

---

## Rate Limiting

L'API applique un rate limiting:

- **Authentification:** 5 requêtes / minute
- **Messages:** 100 requêtes / minute
- **Autres:** 1000 requêtes / minute

---

**Documentation Complète:** https://gate.meeshy.me/docs

**Dernière Mise à Jour:** 25 Novembre 2025
