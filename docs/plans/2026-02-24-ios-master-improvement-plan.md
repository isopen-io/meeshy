# Plan Maitre iOS - Amelioration & Completion

> **Date**: 2026-02-24
> **Scope**: Application iOS Meeshy - Analyse complete + plan d'action
> **Methode**: Audit complet app vs backend capabilities vs bonnes pratiques

---

## Etat Actuel - Resume

### Ce qui fonctionne bien
- Messagerie temps reel (Socket.IO) avec envoi/reception/edition/suppression
- Recherche de messages avec highlighting
- Reactions emoji avec detail par utilisateur
- Traductions multi-langues (texte + audio)
- Transcription audio (speech-to-text)
- Upload media TUS (resumable, multi-fichier, jusqu'a 4GB)
- Gestion conversations (creer, pin, mute, archive, supprimer)
- Feed social, Stories, Statuts ephemeres
- Editeur d'images (crop, filtres, ajustements, effets)
- Enregistrement vocal avec waveform
- PiP video + lecture audio en arriere-plan
- Theme sombre/clair avec design system
- Galerie media fullscreen avec swipe

---

## PHASE 1 : SECURITE & FONDATIONS (Critique)

### 1.1 Migration Keychain (DETTE TECHNIQUE CRITIQUE)
**Priorite**: URGENTE
**Risque actuel**: JWT et session tokens stockes en UserDefaults (non chiffre, extractible depuis backup)

**Travail**:
- Creer `KeychainManager` dans le SDK (`packages/MeeshySDK/Sources/MeeshySDK/Security/`)
- Wrapper Keychain avec `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Migrer `AuthManager` pour stocker/lire tokens depuis Keychain
- Migration transparente: lire UserDefaults si Keychain vide, puis migrer
- Supprimer les tokens de UserDefaults apres migration
- Tests unitaires pour save/load/delete/migration

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Services/AuthManager.swift`

### 1.2 Gestion d'erreurs structuree
**Priorite**: Haute
**Probleme actuel**: Erreurs gerees inconsistamment, pas d'enum d'erreurs domaine, messages generiques

**Travail**:
- Creer `MeeshyError` enum dans le SDK avec sous-types (NetworkError, AuthError, MessageError, MediaError)
- Conformance `LocalizedError` avec messages utilisateur en francais
- Integrer dans `APIClient` pour convertir les erreurs HTTP en erreurs domaine
- Ajouter banner/toast d'erreur global dans `RootView`
- Pattern: ViewModel catch -> expose `@Published var error: MeeshyError?` -> View affiche

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshySDK/Core/MeeshyError.swift`
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- Modifier: Tous les ViewModels (error handling uniforme)
- Creer: `apps/ios/Meeshy/Features/Main/Components/ErrorBannerView.swift`

### 1.3 Logging structure (os.Logger)
**Priorite**: Haute
**Probleme actuel**: `print()` utilise partout, pas de logging structure

**Travail**:
- Creer extension `Logger` avec categories: network, auth, messages, media, socket, ui
- Remplacer tous les `print()` par `Logger.category.level()`
- Niveaux: `.debug` (dev), `.info` (events), `.error` (failures), `.fault` (critical)

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift`
- Modifier: Tous les fichiers avec `print()` (audit grep)

---

## PHASE 2 : FONCTIONNALITES MANQUANTES (Backend existe, iOS absent)

### 2.1 Inscription / Registration
**Priorite**: URGENTE (actuellement login seulement)
**Backend**: `POST /auth/register` existe

**Travail**:
- Creer `RegisterView` avec champs: username, email, password, display name
- Validation cote client (email format, password strength, username disponibilite)
- Appel `AuthService.register()` (existe deja dans SDK)
- Navigation: LoginView <-> RegisterView
- Animation de transition entre login et register

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/RegisterView.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Views/LoginView.swift` (lien vers register)
- Modifier: `apps/ios/Meeshy/MeeshyApp.swift` (flow auth)

### 2.2 Magic Link Authentication
**Priorite**: Moyenne
**Backend**: `POST /auth/magic-link/send` + `POST /auth/magic-link/verify` existent

**Travail**:
- Option "Connexion sans mot de passe" dans LoginView
- Saisie email -> envoi magic link -> ecran d'attente
- Deep link handler pour `meeshy://auth/magic-link?token=xxx`
- Verification token et login automatique

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`
- Modifier: SDK `AuthService.swift` (si methods manquantes)

### 2.3 Password Reset
**Priorite**: Haute
**Backend**: `POST /auth/password-reset/request` + `POST /auth/password-reset/verify` existent

**Travail**:
- Lien "Mot de passe oublie" dans LoginView
- Flow: saisie email -> envoi code -> saisie code + nouveau mot de passe
- Feedback visuel (succes/erreur)

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/PasswordResetView.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`

### 2.4 Profil utilisateur complet
**Priorite**: Haute
**Probleme**: ProfileView existe mais edition limitee

**Travail**:
- Edition: display name, bio, avatar (upload photo), email, phone
- Changement de mot de passe
- Gestion des preferences (langue, notifications, privacy)
- Affichage stats: messages envoyes, conversations, membre depuis
- Upload avatar via TUS

**Fichiers concernes**:
- Modifier: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

### 2.5 Gestion des participants (groupes)
**Priorite**: Haute
**Backend**: Routes participants existent (`GET/POST/DELETE /conversations/:id/participants`)

**Travail**:
- Ecran liste des membres avec roles (ADMIN, MODERATOR, USER)
- Ajouter des membres (recherche utilisateur)
- Retirer un membre (si admin/moderator)
- Promouvoir/retrograder (si admin)
- Quitter le groupe

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- SDK: Verifier/completer `ConversationService.swift` (methods participants)

### 2.6 Notifications Push
**Priorite**: Haute
**Backend**: `POST /push-tokens` existe, Firebase Messaging configure

**Travail**:
- Enregistrement token APNs au lancement
- Envoi token au backend via `POST /push-tokens`
- Handle notification tap -> navigation vers conversation
- Rich notifications avec preview media (MeeshyNotificationExtension existe deja)
- Badges d'app avec unread count
- Preferences: mute par conversation, mute global, son personnalise

**Fichiers concernes**:
- Modifier: `apps/ios/Meeshy/MeeshyApp.swift` (UNUserNotificationCenter setup)
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift`

### 2.7 Block/Unblock utilisateurs
**Priorite**: Moyenne
**Backend**: `POST /users/:id/block`, `DELETE /users/:id/block`, `GET /users/blocked` existent
**SDK**: `BlockService.swift` existe deja

**Travail**:
- Option "Bloquer" dans le profil utilisateur et ConversationInfoSheet
- Ecran "Utilisateurs bloques" dans Settings
- Confirmation avant block
- Mettre a jour l'UI (masquer messages, griser conversation)

**Fichiers concernes**:
- Modifier: `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift`
- Modifier: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

---

## PHASE 3 : EXPERIENCE UTILISATEUR (UX Polish)

### 3.1 Onboarding / First Launch
**Priorite**: Haute

**Travail**:
- 3-4 ecrans d'onboarding avec illustrations animees
- Presentation des features cles (traduction, voice cloning, encryption)
- Demande de permissions (notifications, microphone, camera) avec explications
- Stockage flag `hasCompletedOnboarding` dans UserDefaults
- Skip possible

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/OnboardingView.swift`
- Modifier: `apps/ios/Meeshy/MeeshyApp.swift`

### 3.2 Empty States
**Priorite**: Moyenne
**Probleme**: Ecrans vides sans guidance (liste conversations vide, feed vide, etc.)

**Travail**:
- ConversationListView vide -> illustration + "Commencez une conversation"
- ConversationView vide -> "Envoyez votre premier message"
- FeedView vide -> "Suivez des personnes pour voir leur contenu"
- SearchView sans resultats -> "Aucun resultat"
- Composant reutilisable `EmptyStateView(icon, title, subtitle, action?)`

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`
- Modifier: Toutes les vues avec listes (ConversationListView, FeedView, etc.)

### 3.3 Pull-to-refresh uniforme
**Priorite**: Basse
**Etat**: Deja present sur ConversationListView, verifier les autres

**Travail**:
- Verifier et ajouter `.refreshable` sur FeedView, StatusBarView
- Animation custom coherente

### 3.4 Indicateurs de chargement
**Priorite**: Moyenne
**Probleme**: Certains ecrans n'ont pas de feedback de chargement

**Travail**:
- Skeleton loading pour ConversationListView (shimmer rows)
- Skeleton loading pour messages (shimmer bubbles)
- Loading overlay pour actions lourdes (envoi media, etc.)
- Composant `SkeletonView` reutilisable

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SkeletonView.swift`
- Modifier: ConversationListView, ConversationView (loading states)

### 3.5 Confirmations et feedback
**Priorite**: Moyenne

**Travail**:
- Alert de confirmation avant: supprimer conversation, quitter groupe, bloquer utilisateur
- Toast/snackbar pour actions reussies (message supprime, conversation archivee)
- Undo pour certaines actions (supprimer message -> 5s undo)
- Composant `ToastView` reutilisable

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ToastView.swift`
- Modifier: RootView (toast overlay global)

---

## PHASE 4 : PERFORMANCE & ROBUSTESSE

### 4.1 Offline Support (Cache local)
**Priorite**: Moyenne-Haute
**Probleme**: Aucune persistence locale, l'app est inutilisable sans reseau

**Travail**:
- Cache conversations recentes (SwiftData ou JSON fichier)
- Cache messages recents par conversation (derniers 50)
- Queue d'envoi offline (messages en attente)
- Sync au retour en ligne
- Indicateur "hors ligne" dans l'UI

**Fichiers concernes**:
- Creer: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift`
- Creer: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`
- Modifier: ViewModels pour lire/ecrire cache local

### 4.2 Pagination robuste
**Priorite**: Moyenne
**Probleme**: Infinite scroll fonctionne mais peut avoir des trous

**Travail**:
- Verifier que `loadOlderMessages()` et `loadNewerMessages()` gerent correctement les cursors
- Ajouter retry automatique sur echec de pagination
- Indicateur de chargement en haut/bas de la liste
- Prevenir les appels doubles (debounce)

### 4.3 Memory management audit
**Priorite**: Moyenne
**Probleme potentiel**: Retain cycles dans les closures Combine/Socket.IO

**Travail**:
- Audit `[weak self]` dans tous les `.sink` et event handlers
- Verifier que `Set<AnyCancellable>` est bien clean dans tous les managers
- Profiler avec Instruments Leaks
- Documenter les patterns corrects

### 4.4 Reconnexion Socket.IO resiliente
**Priorite**: Moyenne
**Etat**: Reconnexion basique existe

**Travail**:
- Exponentional backoff sur reconnexion
- Re-join automatique des rooms apres reconnexion
- Sync des messages manques pendant la deconnexion
- Indicateur visuel "Reconnexion en cours..."
- Test: couper/remettre le reseau

---

## PHASE 5 : FEATURES AVANCEES

### 5.1 Appels Voice/Video (WebRTC)
**Priorite**: Haute (feature differenciante)
**Backend**: Routes `calls` existent, WebRTC SPM deja integre

**Travail**:
- Signaling via Socket.IO (offer/answer/ICE candidates)
- UI appel audio: ecran plein, timer, mute, speaker, raccroch
- UI appel video: cameras avant/arriere, PiP, mute video/audio
- Notification entrante d'appel (CallKit integration)
- Historique des appels

**Fichiers concernes**:
- Creer: `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`
- Creer: `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift`

### 5.2 Threads / Reponses en fil
**Priorite**: Moyenne
**Etat**: Reply reference existe dans le modele mais pas d'UI de fil

**Travail**:
- Afficher le message cite dans la bulle de reponse
- Tap sur la citation -> scroll vers le message original
- Vue "Fil de discussion" pour voir toutes les reponses a un message
- Compteur de reponses sur le message parent

### 5.3 Messages ephemeres
**Priorite**: Basse
**Backend**: Champ `expiresAt` sur les messages

**Travail**:
- Option dans le composer pour definir la duree (30s, 1min, 5min, 1h, 24h)
- Timer visuel sur le message
- Auto-suppression cote client + serveur
- Animation de disparition

### 5.4 Partage de contact
**Priorite**: Basse

**Travail**:
- Type d'attachment `contact`
- Affichage carte de contact dans la bulle
- Tap -> ouvrir dans Contacts ou ajouter

### 5.5 Recherche globale
**Priorite**: Moyenne
**Etat**: Recherche dans une conversation existe, pas de recherche globale

**Travail**:
- Barre de recherche dans ConversationListView -> chercher dans toutes les conversations
- Resultats groupes par conversation
- Recherche d'utilisateurs pour nouvelle conversation

---

## PHASE 6 : POLISH & APP STORE

### 6.1 Accessibilite (a11y)
**Priorite**: Haute (obligation App Store)

**Travail**:
- Audit VoiceOver sur chaque ecran
- `.accessibilityLabel()` sur tous les boutons/images
- `.accessibilityHint()` sur les actions
- Dynamic Type support (pas de tailles fixes)
- Contraste minimum WCAG 2.0 AA
- Touch targets minimum 44x44pt

### 6.2 Localisation
**Priorite**: Moyenne
**Etat**: Textes en francais hardcodes

**Travail**:
- Extraire tous les strings dans `Localizable.strings`
- Support francais (default) + anglais
- `String(localized:)` pour tous les textes UI
- Date formatting locale-aware

### 6.3 Settings complets
**Priorite**: Moyenne
**Etat**: SettingsView existe mais incomplete

**Travail**:
- Compte: profil, email, mot de passe, supprimer compte
- Notifications: globales, par conversation, sons
- Confidentialite: derniere connexion, photo de profil, lu/non-lu
- Stockage: cache (taille, vider), media auto-download
- Langue de l'app
- A propos: version, licences, CGU, politique confidentialite

### 6.4 Share Extension
**Priorite**: Basse
**Etat**: Target existe mais vide

**Travail**:
- Recevoir texte, images, URLs depuis d'autres apps
- Picker de conversation pour envoyer
- Preview du contenu partage

### 6.5 Widget iOS
**Priorite**: Basse
**Etat**: Target existe mais vide

**Travail**:
- Widget petit: unread count
- Widget moyen: 2-3 conversations recentes
- Widget grand: derniers messages

---

## RESUME DES PRIORITES

| Phase | Priorite | Effort estime | Impact |
|-------|----------|---------------|--------|
| 1.1 Keychain migration | URGENTE | 1 jour | Securite critique |
| 1.2 Gestion erreurs | Haute | 1 jour | Stabilite |
| 1.3 Logging | Haute | 0.5 jour | Debug/maintenance |
| 2.1 Registration | URGENTE | 1 jour | Onboarding impossible sans |
| 2.2 Magic Link | Moyenne | 1 jour | UX auth alternative |
| 2.3 Password Reset | Haute | 0.5 jour | Retention utilisateur |
| 2.4 Profil complet | Haute | 1.5 jours | Experience utilisateur |
| 2.5 Participants | Haute | 1.5 jours | Groupes inutilisables sans |
| 2.6 Push Notifications | Haute | 2 jours | Engagement critique |
| 2.7 Block/Unblock | Moyenne | 0.5 jour | Securite utilisateur |
| 3.1 Onboarding | Haute | 1 jour | First impression |
| 3.2 Empty States | Moyenne | 0.5 jour | UX |
| 3.3 Pull-to-refresh | Basse | 0.25 jour | Coherence |
| 3.4 Skeletons | Moyenne | 0.5 jour | Perception perf |
| 3.5 Confirmations | Moyenne | 0.5 jour | Prevention erreurs |
| 4.1 Offline Support | Moyenne-Haute | 3 jours | Robustesse |
| 4.2 Pagination | Moyenne | 0.5 jour | Fiabilite |
| 4.3 Memory audit | Moyenne | 0.5 jour | Stabilite |
| 4.4 Reconnexion | Moyenne | 1 jour | Fiabilite |
| 5.1 Appels WebRTC | Haute | 5 jours | Feature majeure |
| 5.2 Threads | Moyenne | 1.5 jours | Messaging avance |
| 5.3 Ephemeres | Basse | 1 jour | Fun feature |
| 5.4 Contact share | Basse | 0.5 jour | Convenience |
| 5.5 Recherche globale | Moyenne | 1 jour | Navigation |
| 6.1 Accessibilite | Haute | 2 jours | App Store requis |
| 6.2 Localisation | Moyenne | 1.5 jours | Internationalisation |
| 6.3 Settings complets | Moyenne | 1.5 jours | Completude |
| 6.4 Share Extension | Basse | 1 jour | Integration OS |
| 6.5 Widget | Basse | 1.5 jours | Engagement |

**Total estime**: ~35 jours de travail

---

## ORDRE D'EXECUTION RECOMMANDE

### Sprint 1 (Fondations critiques)
1. Keychain migration (1.1)
2. Registration (2.1)
3. Password Reset (2.3)
4. Gestion erreurs (1.2)
5. Logging (1.3)

### Sprint 2 (Features essentielles)
6. Push Notifications (2.6)
7. Profil complet (2.4)
8. Gestion participants (2.5)
9. Block/Unblock (2.7)

### Sprint 3 (UX Polish)
10. Onboarding (3.1)
11. Empty States (3.2)
12. Skeletons loading (3.4)
13. Toast/Confirmations (3.5)
14. Settings complets (6.3)

### Sprint 4 (Robustesse)
15. Reconnexion resiliente (4.4)
16. Pagination robuste (4.2)
17. Memory audit (4.3)
18. Offline Support (4.1)

### Sprint 5 (Features avancees)
19. Recherche globale (5.5)
20. Threads/Reponses fil (5.2)
21. Accessibilite (6.1)
22. Localisation (6.2)

### Sprint 6 (Differenciateurs)
23. Appels WebRTC (5.1)
24. Magic Link (2.2)
25. Messages ephemeres (5.3)
26. Share Extension (6.4)
27. Widget (6.5)
