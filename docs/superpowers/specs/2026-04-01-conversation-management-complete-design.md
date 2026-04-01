# Conversation Management — Complete Gap Coverage Design

**Date**: 2026-04-01
**Scope**: Gateway + MeeshySDK + iOS App
**Approach**: Feature Slice Vertical (each feature end-to-end before the next)

---

## 1. Problem Statement

L'audit complet de l'app iOS révèle des lacunes significatives dans la gestion des conversations :

### Lacunes Critiques
1. **Pas d'endpoint "leave"** — un utilisateur ne peut pas quitter un groupe (l'auto-suppression est bloquée côté gateway)
2. **Confusion sémantique** — "Supprimer" dans l'UI appelle `deleteForMe()` mais est labelé comme une suppression
3. **Pas de socket `conversation:updated`** — les changements admin (titre, avatar, permissions) ne sont pas diffusés en temps réel
4. **Préférences personnelles non exposées** — pin, tags, catégories, customName ont des services SDK mais aucune UI

### Lacunes Fonctionnelles
5. **Settings admin incomplets** — `defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds` existent en DB mais pas d'UI
6. **Gestion membres limitée** — pas de ban/unban, pas de UI pour la hiérarchie de rôles complète
7. **Share links non gérables** — création uniquement, pas de révocation/expiration
8. **Avatar/bannière conversation** — API prête, UI d'upload pas branchée dans l'app
9. **Catégories de conversations** — backend prêt, aucune UI

---

## 2. Architecture UX — Deux Surfaces Distinctes

### Surface A : Tab "Préférences" dans ConversationInfoSheet (Sheet)
**Audience** : Tout utilisateur
**Accès** : Nouvelle tab dans le sheet existant (`ConversationInfoSheet`)
**Objectif** : Réglages personnels qui n'affectent que l'utilisateur courant

### Surface B : ConversationAdminView (Vue pleine page, NavigationStack push)
**Audience** : Creator / Admin / Moderator uniquement
**Accès** : Bouton gear dans ConversationInfoSheet (déjà existant)
**Objectif** : Administration de la conversation qui affecte tous les participants

---

## 3. Surface A — Tab Préférences (ConversationInfoSheet)

### 3.1 Emplacement

Le `ConversationInfoSheet` existant a 3 tabs : `Membres`, `Médias`, `Épinglés`.
Ajouter une 4ème tab **"Préférences"** (icône `slider.horizontal.3`).

### 3.2 Sections avec couleurs thématiques

Chaque section utilise le pattern existant de `SettingsView` :
- Header : icône + titre uppercase + tracking 1.2 — dans la couleur de la section
- Container : `surfaceGradient(tint:)` + `border(tint:)` avec cornerRadius 16

#### Section "Mon affichage" — Couleur : `#A855F7` (purple)
| Champ | Type | Description |
|-------|------|-------------|
| Nom personnalisé | TextField | Override local du titre de conversation (`customName` dans UserConversationPreferences) |
| Réaction | Emoji picker | Emoji affiché sur la conversation dans la liste (`reaction` dans preferences) |

#### Section "Organisation" — Couleur : `#3B82F6` (blue)
| Champ | Type | Description |
|-------|------|-------------|
| Épingler | Toggle | `isPinned` — épingle en haut de la liste |
| Catégorie | Picker sheet | Sélection parmi catégories existantes + "Nouvelle catégorie" |
| Tags | Tag input avec autocomplete | Recherche dans les tags existants de l'utilisateur + création libre |

**Tags UX** :
- Champ de recherche en haut
- Résultats filtrés en temps réel parmi tous les tags de l'utilisateur (cross-conversation)
- Tap = ajouter le tag, croix = retirer
- Texte libre + "Entrée" = créer nouveau tag
- Pastilles colorées avec le hash du tag pour différenciation visuelle

**Catégories UX** :
- Picker inline avec les catégories existantes
- Option "Nouvelle catégorie" en bas → champ texte inline
- Icône + couleur par catégorie (définies à la création)

#### Section "Notifications" — Couleur : `#FF6B6B` (red)
| Champ | Type | Description |
|-------|------|-------------|
| Muet | Toggle | `isMuted` — silence toutes les notifications |
| Mentions seulement | Toggle (si muet = off) | Future: ne notifier que pour @mentions |

#### Section "Actions" — Couleur : `#6B7280` (gray)
3 boutons séparés avec sémantique claire :

| Action | Icône | Couleur | Confirmation | Endpoint |
|--------|-------|---------|-------------|----------|
| Archiver | `archivebox.fill` | Warning `#FBBF24` | Non | `PUT preferences {isArchived: true}` |
| Quitter | `rectangle.portrait.and.arrow.right` | Orange `#F97316` | Oui — "Vous ne recevrez plus de messages. Votre historique restera lisible." | `POST /conversations/:id/leave` (NOUVEAU) |
| Supprimer pour moi | `trash.fill` | Error `#F87171` | Oui — "La conversation disparaîtra de votre liste. Vous pourrez la restaurer." | `DELETE /conversations/:id/delete-for-me` |

**Règles d'affichage** :
- "Quitter" visible uniquement pour les conversations de groupe (pas les DMs)
- "Quitter" masqué si l'utilisateur est le Creator (doit transférer ownership d'abord)
- "Archiver" change en "Désarchiver" si déjà archivé

### 3.3 Persistance

Toutes les modifications appellent `PreferenceService.updateConversationPreferences()` avec debounce 500ms pour les champs texte (customName) et immédiat pour les toggles.

---

## 4. Surface B — ConversationAdminView (Vue pleine page)

### 4.1 Accès

Depuis `ConversationInfoSheet`, le bouton gear (déjà conditionnel au rôle) fait un `NavigationLink` push vers `ConversationAdminView` au lieu d'ouvrir `ConversationSettingsView` (qui sera remplacé).

### 4.2 Sections avec couleurs thématiques

#### Section "Identité" — Couleur : `#4ECDC4` (teal)
| Champ | Type | Description |
|-------|------|-------------|
| Bannière | PhotosPicker → ImageEditor (16:9) | Upload/suppression de la bannière |
| Avatar | PhotosPicker → ImageEditor (1:1) | Upload/suppression de l'avatar |
| Titre | TextField | Nom de la conversation |
| Description | TextEditor (3-6 lignes) | Description visible par tous |

**Upload flow** : PhotosPicker → MeeshyImagePreviewView → MeeshyImageEditorView (crop ratio enforced) → compress → `POST /attachments/upload` → `PUT /conversations/:id {avatar/banner: url}`

#### Section "Permissions" — Couleur : `#F8B500` (amber)
| Champ | Type | Description |
|-------|------|-------------|
| Qui peut écrire | Picker : Tout le monde / Membres / Modérateurs / Admins | `defaultWriteRole` |
| Mode annonce | Toggle | `isAnnouncementChannel` — seuls les admins peuvent écrire |
| Mode lent | Picker : Off / 10s / 30s / 60s / 5min | `slowModeSeconds` |
| Traduction auto | Toggle | `autoTranslateEnabled` |

**Interaction** : Quand "Mode annonce" est activé, "Qui peut écrire" est grisé et forcé à "Admins".

#### Section "Membres" — Couleur : `#9B59B6` (purple)

**Header** : Titre "Membres (N)" + barre de recherche inline

**Liste de membres** avec pagination scroll :
```
[Avatar 36pt]  DisplayName          [Badge rôle]  [···]
               @username · Rejoint il y a 3j       menu
```

**Badges de rôle** :
| Rôle | Icône | Couleur badge |
|------|-------|---------------|
| Creator | `crown.fill` | `#F8B500` (amber) |
| Admin | `shield.fill` | `#3B82F6` (blue) |
| Moderator | `checkmark.shield.fill` | `#4ECDC4` (teal) |
| Member | aucun badge | — |

**Menu contextuel `[···]`** (adaptatif selon hiérarchie) :

Le menu ne montre que les actions autorisées. Règle : `currentUser.role.level > target.role.level`

| Action | Icône | Visible si | Effet |
|--------|-------|-----------|-------|
| Promouvoir Admin | `shield.fill` | Current = Creator, Target < Admin | `PATCH role → admin` |
| Promouvoir Modérateur | `checkmark.shield.fill` | Current ≥ Admin, Target = Member | `PATCH role → moderator` |
| Rétrograder Membre | `person.fill` | Current > Target, Target > Member | `PATCH role → member` |
| — séparateur — | | | |
| Expulser | `person.fill.xmark` | Current > Target | `DELETE participant` → `isActive=false, leftAt=now()` |
| Bannir | `hand.raised.fill` | Current > Target | `PATCH ban` → `bannedAt=now()` + empêche rejoin |

**Couleurs des actions** :
- Promouvoir : tint blue `#3B82F6`
- Rétrograder : tint orange `#F97316`
- Expulser : tint error `#F87171`
- Bannir : tint error `#F87171` (destructive)

**Bouton "Ajouter un membre"** en bas de la liste :
- Ouvre une sheet de recherche d'utilisateurs
- Utilise l'endpoint existant `POST /conversations/:id/participants`

#### Section "Liens de partage" — Couleur : `#2ECC71` (green)
| Élément | Description |
|---------|-------------|
| Liste des liens actifs | URL + date de création + nombre d'utilisations |
| Copier | Bouton copie dans le presse-papier |
| Révoquer | Bouton destructif — désactive le lien |
| Créer nouveau | Génère un nouveau lien de partage |

**Note** : Les endpoints de gestion de share links devront être créés côté gateway si inexistants.

#### Section "Zone dangereuse" — Couleur : `#F87171` (red)
| Action | Visible si | Confirmation |
|--------|-----------|-------------|
| Supprimer la conversation | Creator uniquement | Double confirmation : "Cette action est irréversible. Tous les messages seront supprimés pour tous les participants." |

### 4.3 Sauvegarde

**Approche** : Bouton "Enregistrer" dans la navigation bar (trailing), activé dès qu'un champ change (dirty tracking via `hasChanges`). Pas de sauvegarde automatique — les changements admin doivent être intentionnels.

Appel `PUT /conversations/:id` avec tous les champs modifiés → émission socket `conversation:updated`.

---

## 5. Backend — Nouveaux Endpoints

### 5.1 Leave Conversation
```
POST /conversations/:id/leave
```
**Auth** : Bearer token (tout participant actif)
**Logique** :
1. Vérifier que l'utilisateur est un participant actif
2. Si l'utilisateur est le Creator et qu'il reste d'autres participants → `400 Bad Request` "Le créateur doit transférer l'ownership avant de quitter"
3. Si l'utilisateur est le Creator et seul participant → soft-delete la conversation
4. Set `participant.isActive = false`, `participant.leftAt = now()`
5. Émettre socket `conversation:participant-left` à la room
6. Quitter la room Socket.IO
**Réponse** : `{ success: true, data: { conversationId, leftAt } }`

### 5.2 Ban Participant
```
PATCH /conversations/:id/participants/:userId/ban
```
**Auth** : Creator / Admin (rôle strictement supérieur au target)
**Logique** :
1. Vérifier hiérarchie de rôles
2. Set `participant.bannedAt = now()`, `participant.isActive = false`, `participant.leftAt = now()`
3. Émettre socket `conversation:participant-banned` à la room
4. Forcer la déconnexion du socket du participant banni de la room
**Réponse** : `{ success: true, data: { userId, bannedAt } }`

### 5.3 Unban Participant
```
PATCH /conversations/:id/participants/:userId/unban
```
**Auth** : Creator / Admin
**Logique** :
1. Set `participant.bannedAt = null` (NE PAS réactiver — le participant devra rejoindre)
2. Émettre socket `conversation:participant-unbanned`
**Réponse** : `{ success: true, data: { userId } }`

### 5.4 Enrichir PUT /conversations/:id
Ajouter les champs acceptés :
```typescript
{
  title?: string,
  description?: string,
  avatar?: string | null,
  banner?: string | null,
  // NOUVEAUX :
  defaultWriteRole?: 'everyone' | 'member' | 'moderator' | 'admin' | 'creator',
  isAnnouncementChannel?: boolean,
  slowModeSeconds?: number,  // 0 | 10 | 30 | 60 | 300
  autoTranslateEnabled?: boolean
}
```
Après update réussi, émettre :
```typescript
io.to(ROOMS.conversation(id)).emit('conversation:updated', {
  conversationId: id,
  ...changedFields,
  updatedBy: { id: userId, username },
  updatedAt: new Date().toISOString()
})
```

### 5.5 Socket Events Nouveaux

Ajouter à `packages/shared/types/socketio-events.ts` :

```typescript
// SERVER_EVENTS
CONVERSATION_UPDATED: 'conversation:updated',
CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
```

### 5.6 Vérification de ban au join
Dans `POST /conversations/:id/participants` et dans le handler socket `conversation:join`, vérifier :
```typescript
const existingParticipant = await prisma.participant.findFirst({
  where: { conversationId, userId, bannedAt: { not: null } }
})
if (existingParticipant) return sendForbidden(reply, 'Vous êtes banni de cette conversation')
```

---

## 6. MeeshySDK — Modifications

### 6.1 ConversationService — Nouveaux Méthodes
```swift
func leave(conversationId: String) async throws
func banParticipant(conversationId: String, userId: String) async throws
func unbanParticipant(conversationId: String, userId: String) async throws
```

### 6.2 ConversationService — Enrichir update()
Ajouter les paramètres : `defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds`, `autoTranslateEnabled`

### 6.3 PreferenceService — Enrichir request model
Ajouter `customName: String?` au `UpdateConversationPreferencesRequest`

### 6.4 MessageSocketManager — Nouveaux Listeners
```swift
public let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
public let participantLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
public let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
```

### 6.5 Modèles — Nouveaux Event Structs
```swift
struct ConversationUpdatedEvent: Decodable {
    let conversationId: String
    let title: String?
    let description: String?
    let avatar: String?
    let banner: String?
    let defaultWriteRole: String?
    let isAnnouncementChannel: Bool?
    let slowModeSeconds: Int?
    let autoTranslateEnabled: Bool?
    let updatedBy: EventUser
    let updatedAt: String
}

struct ParticipantLeftEvent: Decodable {
    let conversationId: String
    let userId: String
    let username: String
}

struct ParticipantBannedEvent: Decodable {
    let conversationId: String
    let userId: String
    let bannedBy: EventUser
}
```

### 6.6 MeeshyConversation Model — Enrichir
Ajouter les champs manquants si absents :
```swift
public let defaultWriteRole: String?
public let isAnnouncementChannel: Bool?
public let slowModeSeconds: Int?
public let autoTranslateEnabled: Bool?
```

---

## 7. iOS App — Nouvelles Vues

### 7.1 ConversationPreferencesTab (Nouvelle)
**Fichier** : `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`
**Parent** : Intégré comme tab dans `ConversationInfoSheet`
**Pattern** : Même que `SettingsView` — sections colorées avec `settingsSection(title:icon:color:)`

### 7.2 ConversationAdminView (Nouvelle, remplace ConversationSettingsView)
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/ConversationAdminView.swift`
**Navigation** : Push depuis `ConversationInfoSheet` gear button
**Pattern** : ScrollView avec sections colorées, NavigationStack title "Administration"
**ViewModel** : `ConversationAdminViewModel` — gère dirty tracking, upload images, save

### 7.3 MemberManagementSection (Nouvelle)
**Fichier** : `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift`
**Parent** : Intégré dans `ConversationAdminView`
**Fonctionnalités** : Recherche, liste paginée, menu contextuel adaptatif, ajout membre

### 7.4 TagInputView (Nouvelle, réutilisable)
**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift`
**Fonctionnalités** : Champ de recherche + autocomplete + création + pastilles avec croix

### 7.5 CategoryPickerView (Nouvelle, réutilisable)
**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift`
**Fonctionnalités** : Liste des catégories + création inline

### 7.6 Modifications à ConversationInfoSheet
- Ajouter la 4ème tab "Préférences"
- Le bouton "Quitter" existant dans les action buttons → déplacé dans la tab Préférences avec sémantique corrigée
- Le gear button → NavigationLink vers `ConversationAdminView` au lieu de sheet `ConversationSettingsView`

### 7.7 Modifications à ConversationListView
- Swipe "Supprimer" (trailing) → renommé avec icône/label plus précis
- Ajouter swipe "Pin" si pas déjà leading (vérifier — semble exister)

### 7.8 Écoute temps réel
`ConversationListViewModel` s'abonne aux nouveaux publishers :
- `conversationUpdated` → met à jour le modèle local en mémoire
- `participantLeft` → met à jour le compteur de membres
- `participantBanned` → retire de la liste des membres si affiché

---

## 8. Couleurs des Sections — Récapitulatif

### ConversationPreferencesTab (Sheet)
| Section | Couleur | Icône |
|---------|---------|-------|
| Mon affichage | `#A855F7` (purple) | `paintbrush.pointed.fill` |
| Organisation | `#3B82F6` (blue) | `folder.fill` |
| Notifications | `#FF6B6B` (red) | `bell.fill` |
| Actions | `#6B7280` (gray) | `arrow.right.circle.fill` |

### ConversationAdminView (Page)
| Section | Couleur | Icône |
|---------|---------|-------|
| Identité | `#4ECDC4` (teal) | `person.crop.rectangle.fill` |
| Permissions | `#F8B500` (amber) | `lock.shield.fill` |
| Membres | `#9B59B6` (purple) | `person.3.fill` |
| Liens de partage | `#2ECC71` (green) | `link` |
| Zone dangereuse | `#F87171` (red) | `exclamationmark.triangle.fill` |

Toutes les sections utilisent `theme.surfaceGradient(tint:)` et `theme.border(tint:)` pour l'adaptation dark/light automatique.

---

## 9. Feature Slices — Ordre d'implémentation

### Slice 1 : Leave Conversation (Critique)
- Gateway : `POST /conversations/:id/leave` + socket event
- SDK : `ConversationService.leave()` + socket listener
- iOS : Action "Quitter" dans ConversationInfoSheet + confirmation

### Slice 2 : Socket `conversation:updated`
- Shared : nouveau event constant
- Gateway : émission dans PUT endpoint
- SDK : listener + publisher
- iOS : `ConversationListViewModel` réagit aux updates

### Slice 3 : Tab Préférences — Section "Organisation" (Pin, Tags, Catégories)
- SDK : `TagInputView`, `CategoryPickerView`
- SDK : enrichir `UpdateConversationPreferencesRequest` avec `customName`
- iOS : `ConversationPreferencesTab` avec sections Organisation + Mon affichage
- iOS : Intégrer comme 4ème tab dans `ConversationInfoSheet`

### Slice 4 : Tab Préférences — Section "Actions" (Archiver/Quitter/Supprimer clarifié)
- iOS : 3 boutons distincts avec confirmations et descriptions
- iOS : Corriger le label "Supprimer" existant

### Slice 5 : ConversationAdminView — Identité (Avatar/Bannière/Titre/Description)
- iOS : Nouvelle vue avec upload flow complet
- iOS : Remplacer `ConversationSettingsView` par `ConversationAdminView`
- iOS : Gear button → NavigationLink push

### Slice 6 : ConversationAdminView — Permissions
- Gateway : enrichir PUT avec `defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds`, `autoTranslateEnabled`
- SDK : enrichir `ConversationService.update()`
- iOS : Section Permissions dans ConversationAdminView

### Slice 7 : ConversationAdminView — Gestion Membres
- Gateway : `PATCH ban` + `PATCH unban` + vérification ban au join
- SDK : `banParticipant()`, `unbanParticipant()` + socket listeners
- iOS : `MemberManagementSection` avec menu contextuel adaptatif
- iOS : Absorber `ParticipantsView` existant

### Slice 8 : ConversationAdminView — Liens de Partage
- Gateway : endpoints gestion share links (list, revoke) si manquants
- SDK : `ShareLinkService` si manquant
- iOS : Section liens de partage avec CRUD

### Slice 9 : Temps réel complet
- iOS : `ConversationListViewModel` écoute tous les nouveaux events
- iOS : Mise à jour optimiste + rollback
- iOS : Indicateur visuel quand la conversation a été modifiée par un admin

---

## 10. Fichiers Impactés — Résumé

### Gateway (services/gateway/)
| Fichier | Action |
|---------|--------|
| `src/routes/conversations/core.ts` | Enrichir PUT, ajouter émission socket |
| `src/routes/conversations/participants.ts` | Ajouter ban/unban, retirer blocage auto-leave |
| `src/routes/conversations/leave.ts` | **NOUVEAU** — endpoint leave |
| `src/socketio/handlers/ConversationHandler.ts` | Vérification ban au join |

### Shared (packages/shared/)
| Fichier | Action |
|---------|--------|
| `types/socketio-events.ts` | Ajouter 4 nouveaux events |

### MeeshySDK (packages/MeeshySDK/)
| Fichier | Action |
|---------|--------|
| `Services/ConversationService.swift` | leave(), ban(), unban(), enrichir update() |
| `Services/PreferenceService.swift` | Enrichir request avec customName |
| `Sockets/MessageSocketManager.swift` | 3 nouveaux listeners + publishers |
| `Models/CoreModels.swift` | Enrichir MeeshyConversation |
| `Models/SocketEvents.swift` | 3 nouveaux event structs |
| `MeeshyUI/Primitives/TagInputView.swift` | **NOUVEAU** |
| `MeeshyUI/Primitives/CategoryPickerView.swift` | **NOUVEAU** |

### iOS App (apps/ios/)
| Fichier | Action |
|---------|--------|
| `Components/ConversationInfoSheet.swift` | Ajouter tab Préférences, modifier gear action |
| `Components/ConversationPreferencesTab.swift` | **NOUVEAU** |
| `Components/MemberManagementSection.swift` | **NOUVEAU** |
| `Views/ConversationAdminView.swift` | **NOUVEAU** (remplace ConversationSettingsView) |
| `ViewModels/ConversationAdminViewModel.swift` | **NOUVEAU** |
| `ViewModels/ConversationListViewModel.swift` | Abonnement nouveaux socket events |
| `Views/ConversationListView.swift` | Corriger labels swipe actions |

---

## 11. Hors Scope (Futures itérations)

- Consolidation ProfileView / EditProfileView
- Audit trail UI pour admins
- Notification granulaire per-conversation (mentions seulement)
- Transfert d'ownership (Creator → autre participant)
- Gestion avancée des share links (expiration, limite d'utilisations)
- Catégories avec icônes et couleurs personnalisées
- Drag & drop pour réordonner les conversations dans une catégorie
