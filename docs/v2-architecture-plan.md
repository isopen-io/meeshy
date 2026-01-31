# Plan d'Architecture V2 - Meeshy

> Document de reference pour l'integration du frontend V2
> Genere le: 2026-01-31
> Auteur: Architecte - Equipe meeshy-v2-migration

---

## Table des Matieres

1. [Resume Executif](#1-resume-executif)
2. [Cartographie des Pages V2](#2-cartographie-des-pages-v2)
3. [Cartographie des Composants V2](#3-cartographie-des-composants-v2)
4. [Infrastructure Backend Existante](#4-infrastructure-backend-existante)
5. [Analyse des Dependances par Page](#5-analyse-des-dependances-par-page)
6. [Diagramme des Dependances](#6-diagramme-des-dependances)
7. [Plan d'Integration Priorise](#7-plan-dintegration-priorise)
8. [Points d'Integration Backend](#8-points-dintegration-backend)
9. [Risques et Mitigations](#9-risques-et-mitigations)

---

## 1. Resume Executif

### Etat Actuel
Les pages V2 sont des **maquettes UI statiques** avec des donnees mockees. Aucune n'est connectee au backend reel. Le design system "Global Pulse" est complet avec 30+ composants.

### Objectif
Rendre les pages V2 fonctionnelles en les connectant aux:
- Stores Zustand existants (auth, user, conversation, etc.)
- Services API (auth.service, conversations.service, etc.)
- Services Socket.IO (temps reel)
- Gateway API (port 3000)

### Effort Estime
- **Phase 1 (Auth)**: Login/Signup fonctionnels
- **Phase 2 (Core)**: Chats avec messages reels
- **Phase 3 (Features)**: Contacts, Notifications, Settings
- **Phase 4 (Social)**: Communities, Feeds, Profile

---

## 2. Cartographie des Pages V2

| Page | Chemin | Etat | Complexite |
|------|--------|------|------------|
| Landing | `/v2/landing` | UI Complete | Faible |
| Login | `/v2/login` | UI Complete, non connectee | Moyenne |
| Signup | `/v2/signup` | UI Complete, non connectee | Moyenne |
| Chats | `/v2/chats` | UI Complete, donnees mockees | Elevee |
| Contacts | `/v2/contacts` | UI Complete, donnees mockees | Moyenne |
| Settings | `/v2/settings` | UI Complete, non connectee | Moyenne |
| Notifications | `/v2/notifications` | UI Complete, donnees mockees | Moyenne |
| Profile (u) | `/v2/u` | UI Complete, donnees mockees | Moyenne |
| Communities | `/v2/communities` | UI Complete, donnees mockees | Moyenne |
| Feeds | `/v2/feeds` | Existe | A analyser |
| Links | `/v2/links` | Existe | A analyser |
| Terms | `/v2/terms` | UI Complete | Faible |

### Details par Page

#### `/v2/login` - Page de Connexion
```
Etat: UI complete avec formulaire email/password
Manque:
  - Connexion a authService.login()
  - Connexion a useAuthStore
  - Redirection post-login vers /v2/chats
  - Gestion des erreurs d'authentification
  - OAuth Google/GitHub (optionnel)
```

#### `/v2/signup` - Page d'Inscription
```
Etat: UI complete avec 2 etapes (infos + langue)
Manque:
  - Appel API creation compte
  - Connexion a useAuthStore.setUser()
  - Validation des champs
  - Redirection post-signup
```

#### `/v2/chats` - Page de Messagerie
```
Etat: UI tres complete avec:
  - Liste conversations mockees
  - Zone de messages avec bulles multilingues
  - Lecteurs audio/video standalone
  - Drawer de parametres conversation
  - Dark mode fonctionnel

Manque:
  - useConversationStore pour les vraies conversations
  - Socket.IO pour temps reel (messages, typing, presence)
  - conversationsService pour charger les messages
  - useAuthStore pour l'utilisateur connecte
  - useUserStore pour les statuts en ligne
```

#### `/v2/contacts` - Page Contacts
```
Etat: UI avec liste contacts mockee
Manque:
  - API contacts reelle
  - Connexion useUserStore
  - Statuts en ligne temps reel
  - Actions (message, appel)
```

#### `/v2/settings` - Page Parametres
```
Etat: UI complete avec sections:
  - Compte (profil, email, password)
  - Langue de traduction
  - Notifications
  - Apparence (theme)
  - Legal

Manque:
  - useAuthStore pour user actuel
  - useUserPreferencesStore pour preferences
  - APIs update profile/password
  - Persistance des preferences
```

#### `/v2/notifications` - Page Notifications
```
Etat: UI avec notifications mockees
Manque:
  - useNotificationStore
  - API notifications
  - Marquer comme lu
  - Socket.IO temps reel
```

#### `/v2/u` - Page Profil
```
Etat: UI complete avec:
  - Banniere et avatar
  - Stats (conversations, messages, contacts)
  - Langues parlees
  - Actions (liens, contacts, logout)

Manque:
  - useAuthStore.user pour donnees reelles
  - Stats depuis API
  - useAuthStore.logout() fonctionnel
```

#### `/v2/communities` - Page Communautes
```
Etat: UI avec communautes mockees
Manque:
  - communitiesService
  - API rejoindre/quitter
  - Liste reelle des communautes
```

---

## 3. Cartographie des Composants V2

### Composants UI de Base
| Composant | Fichier | Etat |
|-----------|---------|------|
| Button | Button.tsx | Complet |
| Card | Card.tsx | Complet |
| Badge | Badge.tsx | Complet |
| Input | Input.tsx | Complet |
| ThemeProvider | ThemeProvider.tsx | Complet |
| ThemeToggle | ThemeToggle.tsx | Complet |

### Composants Metier
| Composant | Fichier | Etat | Dependances Backend |
|-----------|---------|------|---------------------|
| LanguageOrb | LanguageOrb.tsx | Complet | Aucune |
| MessageBubble | MessageBubble.tsx | Complet | Traductions |
| MessageComposer | MessageComposer.tsx | Complet | Socket.IO |
| ConversationItem | ConversationItem.tsx | Complet | Conversations |
| ConversationDrawer | ConversationDrawer.tsx | Complet | Preferences |
| AudioPlayer | AudioPlayer.tsx | Complet | Attachments |
| VideoPlayer | VideoPlayer.tsx | Complet | Attachments |
| ImageGallery | ImageGallery.tsx | Complet | Attachments |
| TypingIndicator | TypingIndicator.tsx | Complet | Socket.IO |
| GhostBadge | GhostBadge.tsx | Complet | Anonymes |

### Composants a Creer
| Composant | Description | Priorite |
|-----------|-------------|----------|
| AuthGuard | Protection routes authentifiees | Haute |
| StoreInitializer | Init stores au demarrage | Haute |
| SocketProvider | Context Socket.IO | Haute |
| ErrorBoundary | Gestion erreurs globale | Moyenne |

---

## 4. Infrastructure Backend Existante

### Stores Zustand Disponibles

```
/apps/web/stores/
├── auth-store.ts          # Authentification, tokens, user
├── user-store.ts          # Statuts utilisateurs temps reel
├── conversation-store.ts  # Conversations et messages
├── notification-store.ts  # Notifications
├── user-preferences-store.ts # Preferences utilisateur
├── language-store.ts      # Gestion des langues
├── reply-store.ts         # Reponses aux messages
├── call-store.ts          # Appels audio/video
├── app-store.ts           # Etat global app
└── failed-messages-store.ts # Messages echoues
```

### Services API Disponibles

```
/apps/web/services/
├── auth.service.ts           # login, logout, refresh
├── auth-manager.service.ts   # Gestion centralisee tokens
├── conversations.service.ts  # CRUD conversations
├── messages.service.ts       # CRUD messages
├── users.service.ts          # Profils utilisateurs
├── communities.service.ts    # Communautes
├── notification.service.ts   # Notifications
├── translation.service.ts    # Traductions
├── attachmentService.ts      # Fichiers joints
└── socketio/
    ├── connection.service.ts   # Connexion Socket.IO
    ├── messaging.service.ts    # Messages temps reel
    ├── typing.service.ts       # Indicateurs frappe
    ├── presence.service.ts     # Presence utilisateurs
    ├── translation.service.ts  # Traductions temps reel
    └── orchestrator.service.ts # Coordination services
```

### Points d'Entree API

```
Gateway: https://gate.meeshy.me (prod) / localhost:3000 (dev)

Endpoints principaux:
  POST /auth/login          # Authentification
  POST /auth/logout         # Deconnexion
  POST /auth/refresh        # Refresh token
  GET  /auth/me             # Profil courant
  GET  /conversations       # Liste conversations
  GET  /conversations/:id/messages # Messages
  POST /messages            # Envoyer message
  GET  /users               # Liste utilisateurs
  GET  /communities         # Liste communautes
  GET  /notifications       # Notifications
```

---

## 5. Analyse des Dependances par Page

### /v2/login

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/login                                         │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (setUser, setTokens, isAuthenticated)  │
│                                                         │
│ Services:                                               │
│   - authService.login(email, password)                  │
│   - authManager.setCredentials()                        │
│                                                         │
│ Hooks a creer:                                          │
│   - useLogin() - orchestration login                    │
│                                                         │
│ Redirections:                                           │
│   - Success -> /v2/chats                                │
│   - Deja connecte -> /v2/chats                          │
└─────────────────────────────────────────────────────────┘
```

### /v2/signup

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/signup                                        │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (setUser, setTokens)                   │
│   - useLanguageStore (setPreferredLanguage)             │
│                                                         │
│ Services:                                               │
│   - authService.register() [A CREER]                    │
│   - authManager.setCredentials()                        │
│                                                         │
│ Validation:                                             │
│   - Email format                                        │
│   - Password strength (8+ chars)                        │
│   - Name non vide                                       │
│                                                         │
│ Redirections:                                           │
│   - Success -> /v2/chats                                │
└─────────────────────────────────────────────────────────┘
```

### /v2/chats (Page Principale)

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/chats                                         │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (user, isAuthenticated)                │
│   - useConversationStore (conversations, messages,      │
│       currentConversation, addMessage, typingUsers)     │
│   - useUserStore (getUserById, updateUserStatus)        │
│   - useReplyStore (replyTo, setReplyTo)                 │
│   - useLanguageStore (preferredLanguage)                │
│                                                         │
│ Services:                                               │
│   - conversationsService.getConversations()             │
│   - conversationsService.getMessages()                  │
│   - SocketIOOrchestrator (temps reel)                   │
│     - MessagingService (send, receive)                  │
│     - TypingService (start, stop, receive)              │
│     - PresenceService (online status)                   │
│     - TranslationService (request, receive)             │
│                                                         │
│ Hooks a creer/utiliser:                                 │
│   - useConversationMessages(conversationId)             │
│   - useTypingIndicator(conversationId)                  │
│   - useOnlineStatus(userId)                             │
│   - useSendMessage()                                    │
│                                                         │
│ Protection:                                             │
│   - AuthGuard (redirect si non connecte)                │
└─────────────────────────────────────────────────────────┘
```

### /v2/settings

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/settings                                      │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (user, logout)                         │
│   - useUserPreferencesStore (preferences, update)       │
│   - useLanguageStore (preferredLanguage, setLanguage)   │
│                                                         │
│ Services:                                               │
│   - usersService.updateProfile()                        │
│   - authService.changePassword() [A CREER]              │
│   - userPreferencesService.update()                     │
│                                                         │
│ Protection:                                             │
│   - AuthGuard                                           │
└─────────────────────────────────────────────────────────┘
```

### /v2/notifications

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/notifications                                 │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useNotificationStore (notifications, markRead)      │
│   - useAuthStore (user)                                 │
│                                                         │
│ Services:                                               │
│   - notificationService.getAll()                        │
│   - notificationService.markAsRead()                    │
│   - Socket.IO notification events                       │
│                                                         │
│ Protection:                                             │
│   - AuthGuard                                           │
└─────────────────────────────────────────────────────────┘
```

### /v2/contacts

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/contacts                                      │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useUserStore (participants, getUserById)            │
│   - useAuthStore (user)                                 │
│                                                         │
│ Services:                                               │
│   - usersService.getContacts() [A CREER ou adapter]     │
│   - Socket.IO presence events                           │
│                                                         │
│ Protection:                                             │
│   - AuthGuard                                           │
└─────────────────────────────────────────────────────────┘
```

### /v2/u (Profil)

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/u                                             │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (user, logout)                         │
│   - useLanguageStore (userLanguages)                    │
│                                                         │
│ Services:                                               │
│   - usersService.getProfile()                           │
│   - usersService.getStats() [A CREER]                   │
│                                                         │
│ Protection:                                             │
│   - AuthGuard                                           │
└─────────────────────────────────────────────────────────┘
```

### /v2/communities

```
Dependances:
┌─────────────────────────────────────────────────────────┐
│ Page: /v2/communities                                   │
├─────────────────────────────────────────────────────────┤
│ Stores:                                                 │
│   - useAuthStore (user)                                 │
│   - [A CREER] useCommunityStore                         │
│                                                         │
│ Services:                                               │
│   - communitiesService.getAll()                         │
│   - communitiesService.join()                           │
│   - communitiesService.leave()                          │
│                                                         │
│ Protection:                                             │
│   - AuthGuard                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Diagramme des Dependances

```
                    ┌─────────────────────┐
                    │     Gateway API     │
                    │   (port 3000)       │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  REST APIs    │    │   Socket.IO     │    │  Auth Endpoints  │
│               │    │                 │    │                  │
│ /conversations│    │ messaging       │    │ /auth/login      │
│ /messages     │    │ typing          │    │ /auth/logout     │
│ /users        │    │ presence        │    │ /auth/refresh    │
│ /communities  │    │ translation     │    │ /auth/me         │
│ /notifications│    │ notifications   │    │                  │
└───────┬───────┘    └────────┬────────┘    └────────┬─────────┘
        │                     │                      │
        └──────────┬──────────┴──────────────────────┘
                   │
                   ▼
        ┌─────────────────────────────────────────────────────┐
        │                    SERVICES                          │
        │                                                      │
        │  auth.service ─────────────────────────────────────┐ │
        │  conversations.service ────────────────────────────┤ │
        │  messages.service ─────────────────────────────────┤ │
        │  users.service ────────────────────────────────────┤ │
        │  communities.service ──────────────────────────────┤ │
        │  notification.service ─────────────────────────────┤ │
        │                                                    │ │
        │  socketio/                                         │ │
        │    ├── connection.service                          │ │
        │    ├── messaging.service                           │ │
        │    ├── typing.service                              │ │
        │    ├── presence.service                            │ │
        │    ├── translation.service                         │ │
        │    └── orchestrator.service ◄──────────────────────┘ │
        └─────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │                    STORES (Zustand)                  │
        │                                                      │
        │  ┌─────────────┐  ┌──────────────────┐              │
        │  │ auth-store  │  │ conversation-store│              │
        │  │             │  │                   │              │
        │  │ - user      │  │ - conversations   │              │
        │  │ - tokens    │  │ - messages        │              │
        │  │ - isAuth    │  │ - typingUsers     │              │
        │  └──────┬──────┘  └─────────┬─────────┘              │
        │         │                   │                        │
        │  ┌──────┴──────┐  ┌─────────┴─────────┐              │
        │  │ user-store  │  │ notification-store│              │
        │  │             │  │                   │              │
        │  │ - usersMap  │  │ - notifications   │              │
        │  │ - presence  │  │ - unreadCount     │              │
        │  └─────────────┘  └───────────────────┘              │
        │                                                      │
        │  ┌─────────────────┐  ┌─────────────────┐            │
        │  │ language-store  │  │ preferences-store│            │
        │  └─────────────────┘  └──────────────────┘            │
        └─────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │                    PAGES V2                          │
        │                                                      │
        │   ┌──────────┐  ┌──────────┐  ┌──────────┐          │
        │   │  login   │  │  signup  │  │  chats   │          │
        │   │          │  │          │  │          │          │
        │   │ auth-    │  │ auth-    │  │ auth-    │          │
        │   │ store    │  │ store    │  │ store    │          │
        │   │          │  │ language │  │ conv-    │          │
        │   │ auth.    │  │ -store   │  │ store    │          │
        │   │ service  │  │          │  │ user-    │          │
        │   │          │  │ auth.    │  │ store    │          │
        │   │          │  │ service  │  │ socket   │          │
        │   └──────────┘  └──────────┘  └──────────┘          │
        │                                                      │
        │   ┌──────────┐  ┌──────────┐  ┌──────────┐          │
        │   │ settings │  │ contacts │  │ notifs   │          │
        │   │          │  │          │  │          │          │
        │   │ auth-    │  │ user-    │  │ notif-   │          │
        │   │ store    │  │ store    │  │ store    │          │
        │   │ prefs-   │  │ socket   │  │ socket   │          │
        │   │ store    │  │          │  │          │          │
        │   └──────────┘  └──────────┘  └──────────┘          │
        │                                                      │
        │   ┌──────────┐  ┌──────────┐  ┌──────────┐          │
        │   │ profile  │  │communities│ │  feeds   │          │
        │   │          │  │          │  │          │          │
        │   │ auth-    │  │ communi- │  │ [TBD]    │          │
        │   │ store    │  │ ty-store │  │          │          │
        │   │ users.   │  │ communi- │  │          │          │
        │   │ service  │  │ ties.svc │  │          │          │
        │   └──────────┘  └──────────┘  └──────────┘          │
        └─────────────────────────────────────────────────────┘
```

---

## 7. Plan d'Integration Priorise

### Phase 1: Authentification (Priorite: CRITIQUE)

```
Objectif: Login/Signup fonctionnels

Taches:
1. [ ] Creer AuthGuard component
       - Verifie useAuthStore.isAuthenticated
       - Redirect vers /v2/login si non connecte

2. [ ] Integrer /v2/login
       - Connecter formulaire a authService.login()
       - Utiliser useAuthStore.setUser/setTokens
       - Gerer erreurs (toast/message)
       - Redirect vers /v2/chats on success

3. [ ] Integrer /v2/signup
       - Creer authService.register() si manquant
       - Connecter formulaire
       - Sauver langue preferee
       - Redirect vers /v2/chats

4. [ ] Tester flow complet
       - Login -> Chats -> Logout -> Login

Dependances: Aucune
Bloque: Toutes les autres pages
```

### Phase 2: Page Chats - Core (Priorite: HAUTE)

```
Objectif: Afficher vraies conversations et messages

Taches:
1. [ ] Proteger /v2/chats avec AuthGuard

2. [ ] Charger conversations reelles
       - useEffect -> conversationsService.getConversations()
       - Remplacer mockConversations par store
       - Mapper les donnees vers ConversationItemData

3. [ ] Charger messages de conversation
       - On select conversation -> load messages
       - Afficher dans zone messages
       - Gerer pagination (scroll infini)

4. [ ] Connecter MessageComposer
       - Envoyer via Socket.IO MessagingService
       - Optimistic UI (afficher avant confirmation)
       - Gerer echecs

Dependances: Phase 1
```

### Phase 3: Page Chats - Temps Reel (Priorite: HAUTE)

```
Objectif: Messages et presence en temps reel

Taches:
1. [ ] Initialiser Socket.IO a connexion auth
       - Creer SocketProvider context
       - Connecter apres login reussi

2. [ ] Recevoir nouveaux messages
       - MessagingService.onMessage()
       - useConversationStore.addMessage()

3. [ ] Typing indicators
       - Envoyer: TypingService.startTyping()
       - Recevoir: useConversationStore.typingUsers
       - Afficher TypingIndicator component

4. [ ] Presence utilisateurs
       - PresenceService events
       - useUserStore.updateUserStatus()
       - Afficher statut online/offline

Dependances: Phase 2
```

### Phase 4: Traductions (Priorite: MOYENNE)

```
Objectif: Traductions automatiques fonctionnelles

Taches:
1. [ ] Demander traduction
       - TranslationService.requestTranslation()
       - Afficher loading state

2. [ ] Recevoir traductions
       - TranslationService.onTranslation()
       - useConversationStore.addTranslation()

3. [ ] Afficher dans MessageBubble
       - Selecteur de langue
       - Toggle original/traduit

Dependances: Phase 3
```

### Phase 5: Pages Secondaires (Priorite: MOYENNE)

```
Objectif: Contacts, Notifications, Settings, Profile

Taches:
1. [ ] /v2/contacts
       - Charger contacts depuis API
       - Statuts online temps reel
       - Action -> ouvrir conversation

2. [ ] /v2/notifications
       - Charger depuis notificationService
       - Marquer comme lu
       - Recevoir en temps reel

3. [ ] /v2/settings
       - Lire preferences actuelles
       - Sauver modifications
       - Theme (deja fonctionnel via ThemeProvider)

4. [ ] /v2/u (Profile)
       - Afficher user depuis auth-store
       - Stats depuis API
       - Logout fonctionnel

Dependances: Phase 1
```

### Phase 6: Communautes et Feeds (Priorite: BASSE)

```
Objectif: Fonctionnalites sociales

Taches:
1. [ ] /v2/communities
       - Charger communautes
       - Rejoindre/Quitter
       - Navigation vers conversations de groupe

2. [ ] /v2/feeds
       - A analyser plus en detail
       - Peut necessiter nouveau backend

Dependances: Phase 5
```

---

## 8. Points d'Integration Backend

### Endpoints API Requis

| Endpoint | Methode | Service Frontend | Existe? |
|----------|---------|------------------|---------|
| /auth/login | POST | authService | Oui |
| /auth/logout | POST | authService | Oui |
| /auth/refresh | POST | authService | Oui |
| /auth/register | POST | authService | A verifier |
| /auth/me | GET | authService | Oui |
| /conversations | GET | conversationsService | Oui |
| /conversations/:id | GET | conversationsService | Oui |
| /conversations/:id/messages | GET | conversationsService | Oui |
| /conversations/:id/read | POST | conversationsService | Oui |
| /messages | POST | Socket.IO | Oui |
| /users/contacts | GET | usersService | A creer? |
| /users/:id/profile | GET | usersService | A verifier |
| /notifications | GET | notificationService | Oui |
| /notifications/:id/read | PATCH | notificationService | Oui |
| /communities | GET | communitiesService | Oui |
| /communities/:id/join | POST | communitiesService | Oui |
| /communities/:id/leave | POST | communitiesService | Oui |

### Events Socket.IO Requis

| Event | Direction | Service | Utilisation |
|-------|-----------|---------|-------------|
| message | Server->Client | MessagingService | Nouveau message |
| message:sent | Client->Server | MessagingService | Envoyer message |
| typing:start | Both | TypingService | Indicateur frappe |
| typing:stop | Both | TypingService | Arret frappe |
| presence:online | Server->Client | PresenceService | User connecte |
| presence:offline | Server->Client | PresenceService | User deconnecte |
| translation:result | Server->Client | TranslationService | Traduction prete |
| notification | Server->Client | - | Nouvelle notif |

---

## 9. Risques et Mitigations

### Risque 1: Incompatibilite Types
```
Risque: Types des composants V2 != types backend
Impact: Erreurs TypeScript, crashes runtime
Mitigation:
  - Creer layer de transformation/mapping
  - Valider types avec zod si necessaire
  - Tests unitaires sur transformations
```

### Risque 2: Performance Chargement Initial
```
Risque: Trop d'appels API au demarrage
Impact: Lenteur, mauvaise UX
Mitigation:
  - Lazy loading des pages non essentielles
  - Cache React Query (deja en place)
  - Prefetch intelligent
```

### Risque 3: Gestion Etats Complexes
```
Risque: Desync entre store et serveur
Impact: Donnees obsoletes, actions echouees
Mitigation:
  - Optimistic updates avec rollback
  - Reconciliation via Socket.IO
  - Retry automatique sur echec
```

### Risque 4: Breaking Changes V1
```
Risque: Modifications aux services cassent V1
Impact: Regression sur app en production
Mitigation:
  - Branches separees pour V2
  - Services V2 specifiques si necessaire
  - Feature flags pour activer V2
```

---

## Annexes

### A. Structure de Fichiers Recommandee

```
apps/web/
├── app/
│   └── v2/
│       ├── layout.tsx          # V2 layout avec providers
│       ├── (auth)/             # Routes non protegees
│       │   ├── login/
│       │   └── signup/
│       └── (protected)/        # Routes protegees
│           ├── chats/
│           ├── contacts/
│           ├── settings/
│           └── ...
├── components/
│   └── v2/
│       ├── auth/
│       │   └── AuthGuard.tsx
│       ├── providers/
│       │   └── SocketProvider.tsx
│       └── ... (composants existants)
├── hooks/
│   └── v2/
│       ├── useLogin.ts
│       ├── useConversations.ts
│       ├── useRealTimeMessages.ts
│       └── useOnlineStatus.ts
└── lib/
    └── v2/
        ├── transformers/       # Backend -> Frontend mappers
        └── validators/         # Schema validation
```

### B. Checklist de Validation par Page

```
Pour chaque page:
[ ] AuthGuard si necessaire
[ ] Connexion aux stores requis
[ ] Appels services API
[ ] Gestion etats loading/error
[ ] Responsive (mobile first)
[ ] Dark mode support
[ ] Tests E2E
```

---

*Document genere pour l'equipe meeshy-v2-migration*
*Prochaine revision: Apres completion Phase 1*
