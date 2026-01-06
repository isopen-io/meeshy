# Architecture Visuelle - Page Profil

## 🎯 Vue d'ensemble de l'implémentation

```
┌─────────────────────────────────────────────────────────────┐
│                       ProfileView.swift                      │
│                    (Interface principale)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├─► ProfileViewModel (État et logique)
                       │   ├─► AuthService (Authentification)
                       │   ├─► UserService (Opérations utilisateur)
                       │   └─► ConversationService (Statistiques)
                       │
                       ├─► EditProfileSheet (Modal édition)
                       │   └─► Formulaire: Nom, Bio, Téléphone
                       │
                       ├─► ChangePasswordView (Modal mot de passe)
                       │   ├─► Mot de passe actuel
                       │   ├─► Nouveau mot de passe
                       │   ├─► Confirmation
                       │   └─► PasswordStrengthView (Indicateur)
                       │
                       ├─► ChangeEmailView (Modal email)
                       │   ├─► Nouvel email
                       │   └─► Confirmation par mot de passe
                       │
                       └─► Composants réutilisables
                           ├─► AvatarView
                           ├─► EditableAvatarView
                           ├─► SettingsRow
                           └─► SettingsSection
```

## 📱 Hiérarchie des vues

### Vue principale (ProfileView)

```
NavigationStack
└── ScrollView
    └── VStack
        ├── headerView
        │   ├── Avatar (120x120)
        │   ├── Nom d'affichage
        │   ├── @username
        │   └── Bio
        │
        ├── statsView
        │   ├── Conversations
        │   ├── Messages
        │   └── Membre depuis
        │
        ├── settingsSections
        │   ├── Section "Compte"
        │   │   ├── Email
        │   │   ├── Téléphone
        │   │   ├── Mot de passe
        │   │   └── Nom d'utilisateur
        │   │
        │   ├── Section "Paramètres"
        │   │   ├── Paramètres de l'app
        │   │   ├── Langue & Traduction
        │   │   └── Apparence
        │   │
        │   └── Section "À propos"
        │       ├── Version
        │       ├── Conditions d'utilisation
        │       └── Politique de confidentialité
        │
        └── logoutButton
            └── Bouton rouge avec icône
```

## 🔄 Flux d'interaction utilisateur

### 1. Modification du profil

```
Utilisateur                    Vue                    ViewModel                API
    │                          │                          │                     │
    ├─ Appuie "Modifier" ─────>│                          │                     │
    │                          │                          │                     │
    │                          ├─ Affiche EditProfileSheet│                     │
    │                          │                          │                     │
    ├─ Modifie les champs ────>│                          │                     │
    │                          │                          │                     │
    ├─ Appuie "Enregistrer" ──>│                          │                     │
    │                          │                          │                     │
    │                          ├─ updateProfile() ───────>│                     │
    │                          │                          │                     │
    │                          │                          ├─ PUT /users/me ────>│
    │                          │                          │                     │
    │                          │                          │<─── Réponse ────────┤
    │                          │                          │                     │
    │                          │<─ Success/Error ─────────┤                     │
    │                          │                          │                     │
    │<─ Fermeture modal ───────┤                          │                     │
```

### 2. Changement de mot de passe

```
Utilisateur                    Vue                    ViewModel                API
    │                          │                          │                     │
    ├─ "Mot de passe" ────────>│                          │                     │
    │                          │                          │                     │
    │                          ├─ ChangePasswordView       │                     │
    │                          │                          │                     │
    ├─ Entre mots de passe ───>│                          │                     │
    │                          │                          │                     │
    │                          ├─ Valide la force ─────>  │                     │
    │                          │                          │                     │
    ├─ "Enregistrer" ─────────>│                          │                     │
    │                          │                          │                     │
    │                          ├─ changePassword() ──────>│                     │
    │                          │                          │                     │
    │                          │                          ├─ PUT /password ────>│
    │                          │                          │                     │
    │                          │                          │<─── Réponse ────────┤
    │                          │                          │                     │
    │                          │<─ Success ───────────────┤                     │
    │                          │                          │                     │
    │<─ Alerte succès ─────────┤                          │                     │
```

### 3. Déconnexion

```
Utilisateur                    Vue                    ViewModel            AuthService
    │                          │                          │                     │
    ├─ "Déconnexion" ─────────>│                          │                     │
    │                          │                          │                     │
    │                          ├─ Affiche alerte          │                     │
    │                          │                          │                     │
    ├─ Confirme ──────────────>│                          │                     │
    │                          │                          │                     │
    │                          ├─ isLoggingOut = true     │                     │
    │                          │                          │                     │
    │                          ├─ logout() ──────────────>│                     │
    │                          │                          │                     │
    │                          │                          ├─ logout() ─────────>│
    │                          │                          │                     │
    │                          │                          │  1. Ferme WebSocket │
    │                          │                          │  2. Efface tokens   │
    │                          │                          │  3. Efface user     │
    │                          │                          │  4. isAuth = false  │
    │                          │                          │                     │
    │                          │                          │<────────────────────┤
    │                          │                          │                     │
    │                          │<─ Complété ──────────────┤                     │
    │                          │                          │                     │
    │<─ Redirige login ────────┤                          │                     │
```

## 🎨 États de la vue

### Diagramme d'état

```
                    ┌─────────────┐
                    │   Initial   │
                    │  (Loading)  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Loaded    │──────────┐
                    │  (Affiche)  │          │
                    └──────┬──────┘          │
                           │                 │
              ┌────────────┼────────────┐    │
              │            │            │    │
              ▼            ▼            ▼    │
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ Editing  │ │Changing  │ │Changing  │
       │ Profile  │ │Password  │ │ Email    │
       └─────┬────┘ └─────┬────┘ └─────┬────┘
             │            │            │
             └────────────┼────────────┘
                          │
                          ▼
                    ┌──────────┐
                    │  Saving  │
                    └─────┬────┘
                          │
                ┌─────────┼─────────┐
                │                   │
                ▼                   ▼
         ┌───────────┐       ┌───────────┐
         │  Success  │       │   Error   │
         └─────┬─────┘       └─────┬─────┘
               │                   │
               └─────────┬─────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   Loaded    │
                  │  (Refresh)  │
                  └─────────────┘
```

## 💾 Gestion des données

### Modèle de données

```
User (Codable)
├── id: String
├── username: String
├── displayName: String?
├── bio: String?
├── email: String
├── phoneNumber: String?
├── avatar: String?
├── systemLanguage: String
├── createdAt: Date
└── ... autres propriétés

ProfileViewModel (@MainActor, ObservableObject)
├── @Published user: User?
├── @Published isLoading: Bool
├── @Published isEditingProfile: Bool
├── @Published isUploadingAvatar: Bool
├── @Published error: Error?
├── @Published conversationCount: Int
└── @Published messagesSent: Int
```

### Persistance

```
UserDefaults
├── "meeshy_auth_token" → String
├── "meeshy_current_user" → Data (encoded User)
└── "meeshy_session_token" → String

AuthService
├── token: String?
├── sessionToken: String?
├── currentUser: User?
├── isAuthenticated: Bool
└── isAnonymous: Bool
```

## 🔐 Sécurité

### Validation en couches

```
                    ┌──────────────┐
                    │ Input Layer  │
                    │  (Vue UI)    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │Validation    │
                    │Layer         │
                    │(ViewModel)   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │Business      │
                    │Logic Layer   │
                    │(Service)     │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │API Layer     │
                    │(Backend)     │
                    └──────────────┘
```

### Règles de validation

```swift
Email:
- Format regex validé
- Unicité vérifiée côté API
- Confirmation par mot de passe requise

Mot de passe:
- Longueur >= 8 caractères
- Mot de passe actuel vérifié
- Confirmation obligatoire
- Force évaluée (Weak/Medium/Strong)

Profil:
- Tous les champs optionnels sauf username/email
- Validation backend pour contraintes
```

## 📊 Performance

### Opérations asynchrones

```
┌──────────────────┐
│  UI Thread       │
│  (@MainActor)    │
└────────┬─────────┘
         │
         ▼ async/await
┌──────────────────┐
│  Background      │
│  Network calls   │
└────────┬─────────┘
         │
         ▼ await
┌──────────────────┐
│  UI Thread       │
│  Update state    │
└──────────────────┘
```

### Cache et optimisations

```
Images:
├── AsyncImage (cache système)
├── URLCache pour requêtes réseau
└── Lazy loading dans ScrollView

Données:
├── UserDefaults pour token/user
├── Singleton services (no redundancy)
└── @Published pour reactive updates
```

## 🧪 Points de test

### Couverture de test

```
┌─────────────────────────────────────┐
│         ProfileView Tests           │
├─────────────────────────────────────┤
│ ✅ Affichage des infos utilisateur  │
│ ✅ Validation du mot de passe       │
│ ✅ Validation de l'email            │
│ ✅ Déconnexion efface l'état        │
│ ✅ Détection des changements        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│      ProfileViewModel Tests         │
├─────────────────────────────────────┤
│ ✅ Initialisation correcte          │
│ ✅ Mode édition                     │
│ ✅ Détection des modifications      │
│ ⚠️  Appels API (à implémenter)      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│      Password Change Tests          │
├─────────────────────────────────────┤
│ ✅ Validation longueur minimale     │
│ ✅ Confirmation doit correspondre   │
│ ✅ Évaluation de la force           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│       Email Change Tests            │
├─────────────────────────────────────┤
│ ✅ Validation du format             │
│ ✅ Mot de passe requis              │
│ ⚠️  Test avec API (à implémenter)   │
└─────────────────────────────────────┘
```

## 🚀 Déploiement

### Checklist de production

```
✅ Fonctionnalités
   ├── ✅ Affichage profil
   ├── ✅ Édition profil
   ├── ✅ Changement mot de passe
   ├── ✅ Changement email
   ├── ✅ Upload avatar
   └── ✅ Déconnexion

✅ Qualité du code
   ├── ✅ Documentation
   ├── ✅ Tests unitaires de base
   ├── ⚠️  Tests d'intégration
   └── ⚠️  Tests UI

✅ UX/UI
   ├── ✅ Interface intuitive
   ├── ✅ Feedback utilisateur
   ├── ✅ Gestion erreurs
   └── ✅ Indicateurs de chargement

⚠️  Sécurité
   ├── ✅ Validation côté client
   ├── ✅ Confirmation mot de passe
   ├── ⚠️  Validation côté serveur
   └── ⚠️  Rate limiting

⚠️  Performance
   ├── ✅ Async/await
   ├── ✅ Cache images
   ├── ⚠️  Profiling
   └── ⚠️  Optimisation réseau

✅ Localisation
   ├── ✅ Français complet
   └── ⚠️  Autres langues
```

## 📈 Métriques

### KPIs à surveiller

```
Performance:
- Temps de chargement du profil: < 1s
- Temps de sauvegarde: < 2s
- Temps d'upload avatar: < 5s

Utilisation:
- Taux de modification du profil
- Fréquence de changement de mot de passe
- Taux de déconnexion

Qualité:
- Taux d'erreur des formulaires
- Taux d'abandon des modifications
- Satisfaction utilisateur
```

---

**Cette architecture garantit:**
- ✅ Maintenabilité (code organisé, documenté)
- ✅ Scalabilité (services séparés, modulaire)
- ✅ Testabilité (logique séparée de la vue)
- ✅ Sécurité (validation multi-couches)
- ✅ Performance (async, cache, optimisations)
- ✅ UX (feedback, animations, gestion erreurs)
