# Architecture d'Authentification - Meeshy iOS

## 📋 Vue d'Ensemble

L'architecture d'authentification est **déjà complètement implémentée** et fonctionnelle. Voici comment elle fonctionne :

## 🔄 Flow d'Authentification

### 1. Démarrage de l'Application (`MeeshyApp.swift`)

```swift
@main
struct MeeshyApp: App {
    @StateObject private var authManager = AuthenticationManager.shared
    @State private var showOnboarding = !UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")

    var body: some Scene {
        WindowGroup {
            ZStack {
                // ✅ Si authentifié → MainTabView
                if authManager.isAuthenticated {
                    MainTabView()
                }
                // ✅ Sinon → LoginView
                else {
                    LoginView()
                }
            }
            // ✅ Walkthrough au premier lancement
            .fullScreenCover(isPresented: $showOnboarding) {
                OnboardingView(showOnboarding: $showOnboarding)
            }
        }
    }
}
```

### 2. Séquence de Premier Lancement

1. **Application démarre** → `MeeshyApp` initialise
2. **Check si premier lancement** → `showOnboarding` vérifie UserDefaults
3. **Affiche Walkthrough** → `OnboardingView` si premier lancement
4. **Ferme Walkthrough** → Marque `hasCompletedOnboarding = true`
5. **Affiche Login** → `LoginView` car pas encore authentifié

### 3. Walkthrough (`OnboardingView.swift`)

- **4 écrans d'introduction** avec TabView
- **Boutons** :
  - "Suivant" pour l'écran suivant
  - "Passer" pour sauter le walkthrough
  - "Commencer" sur le dernier écran
- **Fermeture** : Met `hasCompletedOnboarding = true` dans UserDefaults

### 4. Page de Login (`LoginView.swift`)

Fonctionnalités disponibles :

- ✅ **Login avec username/email/phone + password**
- ✅ **Biometric authentication** (Face ID / Touch ID)
- ✅ **Sélection du backend** (bouton serveur en haut à droite)
- ✅ **Indicateur URL backend** (badge en bas)
- ✅ **Mot de passe oublié**
- ✅ **Créer un compte**

### 5. Authentification Manager (`AuthenticationManager.swift`)

**État Global** :

```swift
@Published private(set) var isAuthenticated: Bool = false
@Published private(set) var currentUser: User?
```

**Méthodes Principales** :

- `login(username:password:)` → Authentification classique
- `register(...)` → Création de compte
- `refreshAccessToken()` → Rafraîchissement automatique du token
- `logout()` → Déconnexion
- `setup2FA()` / `verify2FA(code:)` → Authentification 2FA

**Stockage Sécurisé** :

- Tokens stockés dans **Keychain** (sécurisé)
- Auto-refresh 5 minutes avant expiration
- Restauration automatique au redémarrage

## 🎯 Comment Ça Marche

### Premier Lancement

```
App Launch
    ↓
Walkthrough (4 écrans)
    ↓
"Commencer" cliqué
    ↓
hasCompletedOnboarding = true
    ↓
LoginView s'affiche
```

### Lancementssuivants

```
App Launch
    ↓
hasCompletedOnboarding = true → Pas de walkthrough
    ↓
Check AuthManager.isAuthenticated
    ↓
    ├─ true → MainTabView (conversations, etc.)
    └─ false → LoginView
```

### Login Réussi

```
LoginView
    ↓
User entre credentials
    ↓
AuthManager.login(username, password)
    ↓
API → /auth/login
    ↓
Reçoit : { token, refreshToken, user }
    ↓
AuthManager stocke dans Keychain
    ↓
isAuthenticated = true
    ↓
MeeshyApp détecte le changement
    ↓
Affiche MainTabView automatiquement
```

## 🔐 Gestion des Tokens

### Stockage

- **Access Token** : Keychain (`me.meeshy.accessToken`)
- **Refresh Token** : Keychain (`me.meeshy.refreshToken`)
- **Expiration Date** : Keychain (`me.meeshy.tokenExpiration`)
- **User Data** : Keychain (`me.meeshy.userData`)

### Auto-Refresh

```swift
// Schedule refresh 5 minutes avant expiration
private func scheduleTokenRefresh() {
    Timer.scheduledTimer(withTimeInterval: timeInterval) { _ in
        try? await refreshAccessToken()
    }
}
```

### Gestion 401 Unauthorized

```swift
func handleUnauthorized() {
    Task {
        try await refreshAccessToken()
        // Si échec → clearCredentials() → retour LoginView
    }
}
```

## 🎨 Interface Backend Selector

Dans `LoginView`, l'utilisateur peut :

1. **Cliquer sur l'icône serveur** (🖥️) en haut à droite
2. **Voir l'URL active** dans le badge en bas
3. **Choisir** :
   - Production (gate.meeshy.me)
   - Local Dev (smpdev02.local:3000)
   - Custom URL

## ✅ État Actuel

Tout est **déjà implémenté et fonctionnel** :

- ✅ Walkthrough au premier lancement
- ✅ Login/Register screens
- ✅ AuthenticationManager avec gestion tokens
- ✅ Auto-refresh des tokens
- ✅ Stockage sécurisé Keychain
- ✅ Routing automatique (login ↔ app)
- ✅ Backend selector
- ✅ Biometric authentication
- ✅ 2FA support

## 🚀 Pour Tester

1. **Supprimer l'app** de l'iPhone
2. **Réinstaller** avec `./run.sh`
3. **Premier lancement** :
   - Walkthrough s'affiche
   - Cliquer "Commencer" ou "Passer"
   - LoginView s'affiche
4. **Se connecter** :
   - Entrer credentials
   - Ou utiliser Face ID/Touch ID
5. **Succès** :
   - Redirigé vers MainTabView automatiquement

## 📱 Navigation

Le système de navigation est réactif via SwiftUI `@Published` :

```swift
if authManager.isAuthenticated {
    MainTabView()  // Automatique quand login réussit
} else {
    LoginView()    // Automatique au logout
}
```

Pas besoin de navigation manuelle, tout est géré par `@StateObject` et `@Published` !
