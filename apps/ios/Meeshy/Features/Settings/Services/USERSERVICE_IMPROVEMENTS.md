# UserService - Améliorations et Corrections

## 📋 Résumé des modifications

Cette mise à jour corrige les erreurs de compilation et améliore l'architecture du `UserService` et de l'`APIService`.

---

## ✅ Corrections principales

### 1. **Erreur de redéclaration de `UserProfileUpdateRequest`**

**Problème** : `UserProfileUpdateRequest` était défini deux fois :
- Une fois référencé dans `UserEndpoints.swift`
- Une fois défini dans `UserService.swift`

**Solution** : Création du fichier `UserRequestModels.swift` avec tous les modèles centralisés.

### 2. **Manque de support pour les query parameters**

**Problème** : `APIService.get()` ne supportait pas les paramètres de requête (query parameters).

**Solution** : Ajout du paramètre optionnel `parameters: [String: Any]?` dans `APIService.get()` qui construit automatiquement l'URL avec les paramètres encodés.

### 3. **Manque de support pour multipart/form-data**

**Problème** : Pas de méthode pour uploader des fichiers avec `multipart/form-data`.

**Solution** : Ajout de la méthode `uploadMultipart()` dans `APIService` pour gérer l'upload de fichiers (avatars, images, etc.).

---

## 🆕 Nouveaux fichiers

### **UserRequestModels.swift**

Fichier centralisé contenant tous les modèles de requêtes/réponses pour les opérations utilisateur :

```swift
// Modèles de requête
- UserProfileUpdateRequest
- ReportUserRequest

// Modèles de réponse
- UserResponse
- BlockedUsersResponse
- UserPreferencesResponse

// Compatibilité
- UserUpdateRequest (alias)
- UserSettings (legacy)
```

**Avantages** :
- ✅ Pas de duplication
- ✅ Facile à maintenir
- ✅ Types `Sendable` pour Swift Concurrency
- ✅ Un seul endroit pour tous les modèles utilisateur

---

## 🔧 Améliorations de l'APIService

### 1. **Support des query parameters**

```swift
// Avant
func get<T: Decodable>(_ path: String, requiresAuth: Bool = true) async throws -> T

// Après
func get<T: Decodable>(_ path: String, parameters: [String: Any]? = nil, requiresAuth: Bool = true) async throws -> T
```

**Utilisation** :
```swift
let response: UserSearchResponse = try await apiService.get(
    "/users/search",
    parameters: [
        "query": "john",
        "page": 1,
        "limit": 20
    ],
    requiresAuth: true
)
```

**Fonctionnalités** :
- ✅ Encodage automatique des caractères spéciaux
- ✅ Gestion intelligente du séparateur `?` ou `&`
- ✅ Support de tous les types de valeurs (String, Int, Bool, etc.)

### 2. **Support du multipart/form-data**

```swift
func uploadMultipart<T: Decodable>(
    _ path: String,
    fileData: Data,
    fileName: String,
    mimeType: String,
    fieldName: String = "file",
    additionalFields: [String: String]? = nil,
    requiresAuth: Bool = true
) async throws -> T
```

**Utilisation** :
```swift
let response: UserResponse = try await apiService.uploadMultipart(
    "/users/me/avatar",
    fileData: imageData,
    fileName: "avatar.jpg",
    mimeType: "image/jpeg",
    fieldName: "avatar",
    requiresAuth: true
)
```

**Fonctionnalités** :
- ✅ Upload de fichiers avec multipart/form-data
- ✅ Champs additionnels personnalisables
- ✅ Boundary automatique
- ✅ Support des authentifications

---

## 🎯 Améliorations du UserService

### 1. **searchUsers avec query parameters**

```swift
// Avant - construction manuelle de l'URL
let path = "/users/search?query=\(query)&page=\(page)&limit=\(limit)"

// Après - utilisation des parameters
let parameters: [String: Any] = [
    "query": query,
    "page": page,
    "limit": limit
]
let response: UserSearchResponse = try await apiService.get(
    UserEndpoints.searchUsers(query: query, page: page, limit: limit).path,
    parameters: parameters,
    requiresAuth: true
)
```

**Avantages** :
- ✅ Plus lisible
- ✅ Encodage automatique
- ✅ Réutilisable pour d'autres endpoints
- ✅ Type-safe

### 2. **uploadAvatar avec multipart**

```swift
// Avant - upload en Base64 via JSON (inefficace)
let base64String = imageData.base64EncodedString()
let request = UploadAvatarRequest(avatar: base64String)

// Après - upload multipart natif (efficace)
let response: UserResponse = try await apiService.uploadMultipart(
    "/users/me/avatar",
    fileData: imageData,
    fileName: "avatar.jpg",
    mimeType: "image/jpeg",
    fieldName: "avatar",
    requiresAuth: true
)
```

**Avantages** :
- ✅ Moins de bande passante (pas de Base64)
- ✅ Standard HTTP multipart/form-data
- ✅ Compatible avec la plupart des backends
- ✅ Plus rapide pour les gros fichiers

### 3. **Code plus propre**

```swift
// Suppression des modèles dupliqués
// Utilisation des modèles depuis UserRequestModels.swift
```

---

## 📊 Comparaison Avant/Après

| Fonctionnalité | Avant | Après |
|----------------|-------|-------|
| Query Parameters | Construction manuelle d'URL | Paramètre `parameters` dans `get()` |
| Upload d'images | Base64 en JSON (inefficace) | Multipart/form-data natif |
| Modèles de données | Dupliqués dans plusieurs fichiers | Centralisés dans `UserRequestModels.swift` |
| Encodage URL | Manuel avec risque d'erreur | Automatique et sûr |
| Réutilisabilité | Faible | Élevée |

---

## 🚀 Impact sur les autres services

Ces améliorations peuvent maintenant être utilisées dans d'autres services :

### **ConversationService**
```swift
// Peut maintenant utiliser des query parameters
let parameters = ["page": 1, "limit": 20]
let response: ConversationsResponse = try await apiService.get(
    "/conversations",
    parameters: parameters,
    requiresAuth: true
)
```

### **MessageService**
```swift
// Peut uploader des images/fichiers
let response: MessageResponse = try await apiService.uploadMultipart(
    "/messages/\(messageId)/attachments",
    fileData: imageData,
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    fieldName: "attachment",
    requiresAuth: true
)
```

### **AttachmentService**
```swift
// Upload d'attachments avec multipart
let response: AttachmentResponse = try await apiService.uploadMultipart(
    "/attachments/upload",
    fileData: fileData,
    fileName: fileName,
    mimeType: mimeType,
    additionalFields: ["conversationId": conversationId],
    requiresAuth: true
)
```

---

## 📝 Recommandations

### Pour les développeurs

1. **Utilisez `parameters`** au lieu de construire manuellement les URLs avec query strings
2. **Utilisez `uploadMultipart`** pour uploader des fichiers au lieu de Base64
3. **Importez les modèles** depuis `UserRequestModels.swift` au lieu de les dupliquer
4. **Réutilisez ces patterns** dans les autres services (ConversationService, MessageService, etc.)

### Pour l'architecture

1. **Créer des fichiers de modèles dédiés** pour chaque domaine (ex: `MessageRequestModels.swift`)
2. **Standardiser l'utilisation** de `APIService` avec ces nouvelles méthodes
3. **Documenter les patterns** pour que tous les développeurs les utilisent

---

## ✨ Résultat final

- ✅ Pas d'erreurs de compilation
- ✅ Code plus propre et maintenable
- ✅ Meilleure performance (multipart vs Base64)
- ✅ Réutilisable dans tout le projet
- ✅ Type-safe et thread-safe (Sendable)
- ✅ Conforme aux standards HTTP

---

## 📚 Références

- `UserService.swift` - Service utilisateur mis à jour
- `APIService.swift` - Service API amélioré
- `UserRequestModels.swift` - Nouveau fichier de modèles
- `UserEndpoints.swift` - Endpoints utilisateur (inchangé)

---

**Date** : 25 novembre 2025  
**Auteur** : Assistant IA  
**Version** : 2.0
