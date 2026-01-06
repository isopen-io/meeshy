# Documentation Technique - ProfileView

## 🏗️ Architecture

### Composants principaux

```
ProfileView (Vue principale)
├── ProfileViewModel (Logique métier)
├── EditProfileSheet (Modal d'édition)
├── ChangePasswordView (Modal mot de passe)
├── ChangeEmailView (Modal email)
└── Composants réutilisables
    ├── AvatarView
    ├── EditableAvatarView
    ├── SettingsRow
    ├── SettingsSection
    └── PasswordStrengthView
```

## 📦 Dépendances

### Services utilisés
- `ProfileViewModel` : Gestion de l'état du profil
- `AuthService` : Authentification et déconnexion
- `UserService` : Opérations CRUD utilisateur
- `ConversationService` : Statistiques des conversations

### Frameworks Apple
- `SwiftUI` : Interface utilisateur
- `Foundation` : Modèles de données et networking
- `PhotosUI` : Sélection de photos

## 🔄 Flux de données

### Pattern MVVM

```
View → ViewModel → Service → API
 ↓                              ↓
State ← Published ← Response ← Data
```

### États de la vue

```swift
@Published var user: User?              // Utilisateur actuel
@Published var isLoading: Bool          // Chargement en cours
@Published var isEditingProfile: Bool   // Mode édition
@Published var isUploadingAvatar: Bool  // Upload avatar
@Published var error: Error?            // Erreur éventuelle
```

## 🔐 Sécurité

### Validation des mots de passe

```swift
// Critères minimums
- Longueur >= 8 caractères
- Confirmation obligatoire
- Indicateur de force

// Calcul de la force
enum PasswordStrength {
    case weak    // < 8 chars
    case medium  // 8-11 chars
    case strong  // >= 12 chars + majuscules + minuscules + chiffres
}
```

### Validation des emails

```swift
// Regex utilisée
"[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"

// Vérifications
- Format valide
- Unicité (côté API)
- Confirmation par mot de passe
```

### Déconnexion sécurisée

```swift
func logout() async {
    // 1. Fermer WebSocket
    await SocketService.shared.disconnect()
    
    // 2. Effacer les tokens
    UserDefaults.standard.removeObject(forKey: userDefaultsTokenKey)
    UserDefaults.standard.removeObject(forKey: userDefaultsSessionKey)
    
    // 3. Effacer l'utilisateur
    UserDefaults.standard.removeObject(forKey: userDefaultsUserKey)
    
    // 4. Réinitialiser l'état
    token = nil
    currentUser = nil
    sessionToken = nil
    isAuthenticated = false
    isAnonymous = false
}
```

## 🌐 API Endpoints

### Endpoints utilisés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/users/me` | Récupérer l'utilisateur actuel |
| PUT | `/users/me` | Mettre à jour le profil |
| PUT | `/users/me/password` | Changer le mot de passe |
| PUT | `/users/me/email` | Changer l'email |
| POST | `/users/me/avatar` | Upload de l'avatar |
| GET | `/users/me/statistics` | Récupérer les statistiques |

### Format des requêtes

#### Mise à jour du profil
```json
PUT /users/me
{
  "displayName": "string",
  "bio": "string",
  "phoneNumber": "string"
}
```

#### Changement de mot de passe
```json
PUT /users/me/password
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

#### Changement d'email
```json
PUT /users/me/email
{
  "email": "string",
  "password": "string"
}
```

### Gestion des erreurs

```swift
// Codes d'erreur HTTP gérés
- 200: Succès
- 204: Succès sans contenu
- 401: Non autorisé (mauvais mot de passe)
- 404: Endpoint non implémenté (fallback gracieux)
- 409: Conflit (email déjà utilisé)
- 500: Erreur serveur
```

## 🎨 Interface utilisateur

### Palette de couleurs

```swift
// Couleurs système utilisées
- Color(.systemGroupedBackground)      // Fond principal
- Color(.secondarySystemGroupedBackground)  // Fond secondaire
- Color.blue                            // Accent principal
- Color.red                             // Déconnexion/erreurs
- Color.secondary                       // Texte secondaire
- Color.primary                         // Texte principal
```

### Tailles et espacements

```swift
// Avatar
- Taille par défaut: 120x120 points
- Taille dans EditableAvatarView: personnalisable

// Sections
- Padding vertical: 24 points
- Padding horizontal: 16 points
- Espacement entre sections: 16 points

// Boutons
- Hauteur standard: 56 points
- Corner radius: 12 points
```

### Animations

```swift
// Indicateurs de chargement
- ProgressView avec overlay semi-transparent
- Scale effect: 1.5x
- Transition: opacity

// Changement d'état
- Animation: .easeInOut
- Durée: par défaut SwiftUI (0.35s)
```

## 🧪 Tests

### Tests unitaires inclus

```swift
@Suite("Profile View Tests")
- profileViewDisplaysUserInfo()
- passwordStrengthValidation()
- emailValidation()
- logoutClearsState()
- profileUpdateValidation()
```

### Tests à ajouter

```swift
// Tests d'intégration
- testProfileUpdateWithAPI()
- testPasswordChangeWithAPI()
- testEmailChangeWithAPI()
- testAvatarUploadWithAPI()

// Tests UI
- testNavigationToEditProfile()
- testPasswordStrengthIndicator()
- testLogoutConfirmation()
```

## 🔧 Configuration requise

### Versions minimales
- iOS 16.0+
- Swift 5.9+
- Xcode 15.0+

### Permissions nécessaires
```xml
<!-- Info.plist -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Nous avons besoin d'accéder à vos photos pour mettre à jour votre avatar</string>

<key>NSCameraUsageDescription</key>
<string>Nous avons besoin d'accéder à la caméra pour prendre une photo de profil</string>
```

## 🚀 Optimisations

### Performance

1. **Chargement asynchrone**
   ```swift
   .task {
       await viewModel.loadProfile()
   }
   ```

2. **Images en cache**
   - AsyncImage utilise le cache système
   - ImageCacheManager pour images personnalisées

3. **Debouncing**
   - Validation des formulaires différée
   - Évite les requêtes multiples

### Mémoire

1. **@StateObject vs @ObservedObject**
   ```swift
   @StateObject private var viewModel = ProfileViewModel()  // Propriétaire
   @ObservedObject var viewModel: ProfileViewModel          // Référence
   ```

2. **Weak references**
   - Services singleton : pas de problème de cycle
   - Closures : `[weak self]` quand nécessaire

## 🐛 Débogage

### Logs importants

```swift
// Utilisation de logger
logger.info("Loaded user profile")
logger.error("Error loading profile: \(error)")
logger.warn("Statistics endpoint not implemented")
```

### Points de breakpoint

1. `loadProfile()` - Chargement initial
2. `updateProfile()` - Sauvegarde des modifications
3. `changePassword()` - Changement de mot de passe
4. `logout()` - Déconnexion

### Problèmes courants

#### Le profil ne se charge pas
```swift
// Vérifier
- Token d'authentification présent
- Connexion réseau active
- Endpoint API disponible
```

#### Les modifications ne sont pas sauvegardées
```swift
// Vérifier
- hasChanges() retourne true
- Validation des champs réussie
- Pas d'erreur dans le ViewModel
```

#### La déconnexion ne fonctionne pas
```swift
// Vérifier
- AuthService.logout() est appelé
- UserDefaults est vidé
- isAuthenticated = false
```

## 📚 Ressources additionnelles

### Documentation Apple
- [SwiftUI Views](https://developer.apple.com/documentation/swiftui/views)
- [Async/Await](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html)
- [PhotosUI](https://developer.apple.com/documentation/photosui)

### Patterns utilisés
- MVVM (Model-View-ViewModel)
- Repository Pattern (Services)
- Observer Pattern (@Published)
- Dependency Injection (init avec services)

## 🔄 Évolutions futures

### Fonctionnalités à ajouter

1. **Authentification biométrique**
   ```swift
   - Face ID / Touch ID
   - LAContext pour LocalAuthentication
   ```

2. **Authentification à deux facteurs**
   ```swift
   - QR code pour setup
   - Code à 6 chiffres
   - Codes de récupération
   ```

3. **Gestion des sessions**
   ```swift
   - Liste des appareils connectés
   - Déconnexion à distance
   - Historique des connexions
   ```

4. **Export des données**
   ```swift
   - Conformité RGPD
   - Export JSON/CSV
   - Téléchargement de toutes les données
   ```

### Améliorations UI/UX

1. **Prévisualisation de l'avatar**
   - Crop et zoom avant upload
   - Filtres et ajustements

2. **Thème personnalisé**
   - Couleurs d'accent personnalisables
   - Polices personnalisables

3. **Statistiques avancées**
   - Graphiques de messages
   - Temps passé dans l'app
   - Langues utilisées

## 📝 Checklist de développement

- [x] Interface utilisateur complète
- [x] Édition du profil
- [x] Changement de mot de passe
- [x] Changement d'email
- [x] Upload d'avatar
- [x] Déconnexion fonctionnelle
- [x] Validation des formulaires
- [x] Gestion des erreurs
- [x] Indicateurs de chargement
- [x] Tests unitaires
- [ ] Tests d'intégration
- [ ] Tests UI
- [ ] Documentation API complète
- [ ] Accessibilité (VoiceOver)
- [ ] Internationalisation complète

## 🤝 Contribution

### Guidelines

1. Suivre les conventions Swift/SwiftUI
2. Documenter toutes les fonctions publiques
3. Ajouter des tests pour chaque nouvelle fonctionnalité
4. Utiliser les logs pour faciliter le débogage
5. Valider sur plusieurs tailles d'écran

### Pull Request Template

```markdown
## Description
[Description des changements]

## Type de changement
- [ ] Bug fix
- [ ] Nouvelle fonctionnalité
- [ ] Amélioration
- [ ] Refactoring

## Tests
- [ ] Tests unitaires ajoutés/mis à jour
- [ ] Tests manuels effectués
- [ ] Tests sur iPhone et iPad

## Checklist
- [ ] Code documenté
- [ ] Pas de warning de compilation
- [ ] Conforme aux guidelines
```

---

**Auteur** : Équipe Meeshy
**Dernière mise à jour** : 24 novembre 2024
**Version** : 1.0.0
