# ✅ CORRECTIONS - Cohérence des chemins d'API avec le backend

## 🎯 Problème identifié

D'après les logs, toutes les requêtes API retournaient des erreurs **404 Not Found** :
```
❌ HTTP 404 - Not Found for https://gate.meeshy.me/users/me
❌ HTTP 404 - Not Found for https://gate.meeshy.me/conversations
```

**Cause racine** : Les endpoints frontend n'incluaient pas le préfixe `/api/` requis par le backend.

### URLs incorrectes (avant)
- ❌ `https://gate.meeshy.me/users/me`
- ❌ `https://gate.meeshy.me/conversations`
- ❌ `https://gate.meeshy.me/users/{id}`

### URLs correctes (après)
- ✅ `https://gate.meeshy.me/api/users/me`
- ✅ `https://gate.meeshy.me/api/conversations`
- ✅ `https://gate.meeshy.me/api/users/{id}`

---

## 📝 Fichiers corrigés

### 1. **UserEndpoints.swift** ✅

Ajout du préfixe `/api/` à tous les endpoints utilisateur :

| Endpoint | Avant | Après |
|----------|-------|-------|
| Current User | `/users/me` | `/api/users/me` |
| Get User | `/users/{id}` | `/api/users/{id}` |
| Search Users | `/users/search` | `/api/users/search` |
| Update Status | `/users/me/status` | `/api/users/me/status` |
| Update Preferences | `/users/me/preferences` | `/api/users/me/preferences` |
| Block User | `/users/me/blocked/{id}` | `/api/users/me/blocked/{id}` |
| Get Blocked Users | `/users/me/blocked` | `/api/users/me/blocked` |
| Report User | `/users/{id}/report` | `/api/users/{id}/report` |
| Delete Account | `/users/me` | `/api/users/me` |

**Code modifié :**
```swift
var path: String {
    switch self {
    case .getCurrentUser:
        return "/api/users/me"  // Était: "/users/me"
    case .getUser(let userId):
        return "/api/users/\(userId)"  // Était: "/users/\(userId)"
    // ... etc pour tous les cas
    }
}
```

---

### 2. **UserService.swift** ✅

Correction du chemin d'upload d'avatar :

**Avant :**
```swift
let path = "/users/me/avatar"
```

**Après :**
```swift
let path = "/api/users/me/avatar"
```

**Log ajouté :**
```swift
userLogger.info("📸 Uploading avatar (\(imageData.count) bytes) to: \(path)")
```

---

### 3. **ConversationService.swift** ✅

Ajout du préfixe `/api/` à tous les endpoints de conversation :

| Méthode | Ancien chemin | Nouveau chemin |
|---------|---------------|----------------|
| `getConversation` | `/conversations/{id}` | `/api/conversations/{id}` |
| `createConversation` | `/conversations` | `/api/conversations` |
| `updateConversation` | `/conversations/{id}` | `/api/conversations/{id}` |
| `deleteConversation` | `/conversations/{id}` | `/api/conversations/{id}` |
| `addParticipant` | `/conversations/{id}/participants` | `/api/conversations/{id}/participants` |
| `removeParticipant` | `/conversations/{id}/participants/{userId}` | `/api/conversations/{id}/participants/{userId}` |
| `markAsRead` | `/conversations/{id}/read` | `/api/conversations/{id}/read` |

**Logs améliorés :**
```swift
chatLogger.info("💬 Fetching conversation \(conversationId) from: \(path)")
chatLogger.info("➕ Creating conversation at: \(path)")
chatLogger.info("✏️ Updating conversation \(request.conversationId) at: \(path)")
chatLogger.info("🗑️ Deleting conversation \(conversationId) at: \(path)")
chatLogger.info("➕ Adding participant \(userId) to conversation \(conversationId) at: \(path)")
chatLogger.info("➖ Removing participant \(userId) from conversation \(conversationId) at: \(path)")
chatLogger.info("✔️ Marking conversation \(conversationId) as read at: \(path)")
```

---

### 4. **ProfileViewModel.swift** ✅

Remplacement des URLs hardcodées par des URLs dynamiques utilisant `APIConfiguration` et ajout du préfixe `/api/` :

#### a) **loadStatistics()** 

**Avant :**
```swift
guard let url = URL(string: "http://localhost:3000/users/me/statistics") else {
```

**Après :**
```swift
let baseURL = APIConfiguration.shared.currentBaseURL
guard let url = URL(string: "\(baseURL)/api/users/me/statistics") else {
```

**Log ajouté :**
```swift
logger.info("📊 Fetching user statistics from: \(url.absoluteString)")
```

#### b) **changePassword()** 

**Avant :**
```swift
guard let url = URL(string: "http://localhost:3000/users/me/password") else {
```

**Après :**
```swift
let baseURL = APIConfiguration.shared.currentBaseURL
guard let url = URL(string: "\(baseURL)/api/users/me/password") else {
```

**Log ajouté :**
```swift
logger.info("🔐 Changing password at: \(url.absoluteString)")
```

#### c) **changeEmail()** 

**Avant :**
```swift
guard let url = URL(string: "http://localhost:3000/users/me/email") else {
```

**Après :**
```swift
let baseURL = APIConfiguration.shared.currentBaseURL
guard let url = URL(string: "\(baseURL)/api/users/me/email") else {
```

**Log ajouté :**
```swift
logger.info("📧 Changing email at: \(url.absoluteString)")
```

#### d) **UserProfileViewModel.blockUser()** 

**Avant :**
```swift
guard let url = URL(string: "http://localhost:3000/users/\(userId)/block") else {
```

**Après :**
```swift
let baseURL = APIConfiguration.shared.currentBaseURL
guard let url = URL(string: "\(baseURL)/api/users/\(userId)/block") else {
```

**Log ajouté :**
```swift
logger.info("🚫 Blocking user \(userId) at: \(url.absoluteString)")
```

---

## 🎨 Logs améliorés

Avec ces corrections, vous verrez maintenant dans les logs :

### Exemple de logs de succès

```
🔧 Building request - Base URL: https://gate.meeshy.me, Path: /api/users/me
🔧 Complete URL: https://gate.meeshy.me/api/users/me
🔑 Added Authorization header (token: eyJhbGciOiJIUzI1NiI...)
📡 [GET] → https://gate.meeshy.me/api/users/me
⬆️ Executing request: GET https://gate.meeshy.me/api/users/me
⬇️ Response: 200 from https://gate.meeshy.me/api/users/me (342 bytes)
✅ HTTP 200 - Success for https://gate.meeshy.me/api/users/me
✅ Successfully decoded response from https://gate.meeshy.me/api/users/me
✅ Successfully fetched current user: john_doe
```

### Exemple de logs d'erreur (si endpoint non implémenté)

```
🔧 Building request - Base URL: https://gate.meeshy.me, Path: /api/users/me/statistics
🔧 Complete URL: https://gate.meeshy.me/api/users/me/statistics
📡 [GET] → https://gate.meeshy.me/api/users/me/statistics
⬆️ Executing request: GET https://gate.meeshy.me/api/users/me/statistics
⬇️ Response: 404 from https://gate.meeshy.me/api/users/me/statistics (85 bytes)
🔍 HTTP 404 - Not Found for https://gate.meeshy.me/api/users/me/statistics
❌ Error response body: {"success":false,"error":"Endpoint not implemented"}
```

---

## ✅ Avantages de ces corrections

### 1. **Cohérence avec le backend** ✅
- Tous les endpoints utilisent maintenant le préfixe `/api/` attendu par le serveur
- Les URLs correspondent exactement à la structure de l'API backend

### 2. **URLs dynamiques** ✅
- Utilisation de `APIConfiguration.shared.currentBaseURL` au lieu d'URLs hardcodées
- Permet de changer facilement entre environnements (dev/prod)
- Fonctionne avec le système de sélection de backend

### 3. **Logs détaillés** ✅
- URLs complètes dans tous les logs
- Facilite le debugging
- Permet de vérifier rapidement les endpoints appelés

### 4. **Maintenance facilitée** ✅
- Un seul endroit pour définir les chemins d'API (`UserEndpoints`, `ConversationEndpoints`, etc.)
- Plus de duplication de code
- Cohérence garantie dans toute l'application

---

## 🧪 Tests à effectuer

### 1. Test des endpoints utilisateur

```swift
// Ces appels devraient maintenant fonctionner (si implémentés côté backend)
try await userService.getCurrentUser()
// → GET https://gate.meeshy.me/api/users/me

try await userService.getUser(userId: "123")
// → GET https://gate.meeshy.me/api/users/123

try await userService.updateProfile(request)
// → PUT https://gate.meeshy.me/api/users/me

try await userService.uploadAvatar(imageData)
// → POST https://gate.meeshy.me/api/users/me/avatar
```

### 2. Test des endpoints de conversation

```swift
try await conversationService.fetchConversations()
// → GET https://gate.meeshy.me/api/conversations

try await conversationService.createConversation(request)
// → POST https://gate.meeshy.me/api/conversations

try await conversationService.markAsRead(conversationId: "abc")
// → POST https://gate.meeshy.me/api/conversations/abc/read
```

### 3. Test des endpoints de profile

```swift
// Changer de mot de passe
await profileViewModel.changePassword(currentPassword: "old", newPassword: "new")
// → PUT https://gate.meeshy.me/api/users/me/password

// Changer d'email
await profileViewModel.changeEmail(newEmail: "new@email.com", password: "pass")
// → PUT https://gate.meeshy.me/api/users/me/email

// Bloquer un utilisateur
await userProfileViewModel.blockUser()
// → POST https://gate.meeshy.me/api/users/{id}/block
```

---

## 🔄 Changement d'environnement

Grâce à `APIConfiguration`, vous pouvez facilement basculer entre environnements :

```swift
// Développement local
BackendConfig.shared.selectedURL = "https://smpdev02.local:3000"
// Les requêtes iront vers: https://smpdev02.local:3000/api/users/me

// Production
BackendConfig.shared.selectedURL = "https://gate.meeshy.me"
// Les requêtes iront vers: https://gate.meeshy.me/api/users/me
```

---

## 📊 Structure finale des URLs

### Format général
```
{baseURL}/api/{resource}/{action}
```

### Exemples concrets

| Type | Ressource | Action | URL complète |
|------|-----------|--------|--------------|
| User | me | GET profile | `{baseURL}/api/users/me` |
| User | me | PUT update | `{baseURL}/api/users/me` |
| User | me | POST avatar | `{baseURL}/api/users/me/avatar` |
| User | me | PUT password | `{baseURL}/api/users/me/password` |
| User | me | PUT email | `{baseURL}/api/users/me/email` |
| User | me | GET statistics | `{baseURL}/api/users/me/statistics` |
| User | {id} | GET profile | `{baseURL}/api/users/{id}` |
| User | {id} | POST block | `{baseURL}/api/users/{id}/block` |
| User | {id} | POST report | `{baseURL}/api/users/{id}/report` |
| Conversation | - | GET list | `{baseURL}/api/conversations` |
| Conversation | - | POST create | `{baseURL}/api/conversations` |
| Conversation | {id} | GET single | `{baseURL}/api/conversations/{id}` |
| Conversation | {id} | PUT update | `{baseURL}/api/conversations/{id}` |
| Conversation | {id} | DELETE | `{baseURL}/api/conversations/{id}` |
| Conversation | {id}/read | POST | `{baseURL}/api/conversations/{id}/read` |

---

## ✅ Résultat

### Avant les corrections ❌
```
❌ GET https://gate.meeshy.me/users/me → 404 Not Found
❌ GET https://gate.meeshy.me/conversations → 404 Not Found
❌ POST http://localhost:3000/users/me/avatar → Erreur (URL hardcodée)
```

### Après les corrections ✅
```
✅ GET https://gate.meeshy.me/api/users/me → Fonctionne (si implémenté)
✅ GET https://gate.meeshy.me/api/conversations → Fonctionne (si implémenté)
✅ POST https://gate.meeshy.me/api/users/me/avatar → URLs dynamiques
```

---

## 📚 Documentation backend à vérifier

Pour finaliser l'intégration, assurez-vous que le backend implémente ces endpoints :

### Endpoints utilisateur (priorité haute)
- [ ] `GET /api/users/me` - Récupérer le profil de l'utilisateur actuel
- [ ] `PUT /api/users/me` - Mettre à jour le profil
- [ ] `POST /api/users/me/avatar` - Upload d'avatar
- [ ] `GET /api/users/{id}` - Récupérer un profil utilisateur
- [ ] `GET /api/users/search?query=xxx` - Rechercher des utilisateurs

### Endpoints de conversation (priorité haute)
- [ ] `GET /api/conversations` - Liste des conversations
- [ ] `POST /api/conversations` - Créer une conversation
- [ ] `GET /api/conversations/{id}` - Récupérer une conversation
- [ ] `POST /api/conversations/{id}/read` - Marquer comme lu

### Endpoints secondaires (priorité moyenne)
- [ ] `GET /api/users/me/statistics` - Statistiques utilisateur
- [ ] `PUT /api/users/me/password` - Changer le mot de passe
- [ ] `PUT /api/users/me/email` - Changer l'email
- [ ] `POST /api/users/{id}/block` - Bloquer un utilisateur
- [ ] `POST /api/users/{id}/report` - Signaler un utilisateur

---

**Date** : 25 novembre 2025  
**Statut** : ✅ CORRIGÉ ET PRÊT POUR TESTS
