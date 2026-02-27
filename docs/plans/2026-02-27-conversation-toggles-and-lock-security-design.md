# Design : Toggles Conversations + Système de Sécurité Lock

**Date** : 2026-02-27
**Branche** : fix/story-image-upload-and-post-creation
**Scope** : `apps/ios/Meeshy/`

---

## 1. Contexte

Deux problèmes à résoudre :

1. **Toggles incohérents** : Les actions du menu contextuel et des swipe actions n'affichent pas systématiquement l'action inverse lorsqu'un état est déjà actif (ex : "Archiver" même quand déjà archivé).
2. **Système de lock insuffisant** : Le `ConversationLockManager` actuel utilise un seul PIN global 4 chiffres partagé par toutes les conversations. Le nouveau système requiert un master PIN 6 chiffres + un PIN 4 chiffres unique par conversation.

---

## 2. Toggles du menu contextuel

### Règle générale
Chaque action affiche son **inverse** lorsque l'état est déjà actif.

| Action | Condition affichage "action normale" | Condition affichage "action inverse" |
|--------|--------------------------------------|---------------------------------------|
| Archive | `!conversation.isArchived` | `conversation.isArchived` → "Désarchiver" |
| Mute | `!conversation.isMuted` | `conversation.isMuted` → "Activer notifs" |
| Lock | `!lockManager.isLocked(id)` | `lockManager.isLocked(id)` → "Déverrouiller" (PIN 4ch) |
| Mark | `conversation.unreadCount == 0` → "Marquer non lu" | `conversation.unreadCount > 0` → "Marquer lu" |
| Block | `!isBlocked` | `isBlocked` → "Débloquer" |

### Règle block + archive
- Bloquer une conversation l'archive automatiquement
- Lorsque `isBlocked == true`, le bouton "Désarchiver" est **masqué** dans les swipe actions et le context menu
- L'utilisateur doit d'abord **Débloquer**, ce qui n'archive pas automatiquement — la conversation reste archivée jusqu'à ce qu'il la désarchive manuellement

---

## 3. Système de sécurité Lock (Approche A — Keychain individuel)

### 3.1 Modèle de stockage

```
Keychain:
  "meeshy_master_pin"              → SHA256(masterPin6digits)
  "meeshy_lock_<conversationId>"   → SHA256(conversationPin4digits)

UserDefaults:
  "meeshy_locked_conversation_ids" → [String]  // liste des conversationIds verrouillés
```

### 3.2 Règles métier

- Il est **impossible** de verrouiller une conversation sans avoir d'abord configuré le master PIN 6 chiffres dans Settings > Sécurité
- Chaque conversation verrouillée possède son propre code 4 chiffres unique
- Le master PIN 6 chiffres ne sert PAS à ouvrir une conversation au quotidien — il sert à l'administration depuis Settings
- "Déverrouiller tout" supprime tous les verrous individuels mais **conserve** le master PIN
- Le master PIN ne peut être supprimé que si aucune conversation n'est verrouillée

### 3.3 Flows utilisateur

#### Configurer le master PIN (Settings > Sécurité, première fois)
```
Entrer 6 chiffres → Confirmer 6 chiffres → SHA256 → Keychain("meeshy_master_pin")
```

#### Verrouiller une conversation
```
Tap "Verrouiller" dans menu
  ├─ Master PIN absent → Toast "Configurez d'abord votre master PIN" → redirect Settings
  └─ Master PIN présent →
       Étape 1 : Entrer master PIN (6ch) → vérifier SHA256
       Étape 2 : Entrer code conversation (4ch)
       Étape 3 : Confirmer code conversation (4ch)
       → Stocker SHA256 en Keychain("meeshy_lock_<id>") + ajouter à UserDefaults list
```

#### Ouvrir une conversation verrouillée (tap)
```
Entrer code conversation (4ch) → vérifier SHA256 → ouvrir
```

#### Déverrouiller une conversation (depuis menu contextuel)
```
Tap "Déverrouiller" → Entrer code conversation (4ch) → vérifier → supprimer Keychain item + retirer de UserDefaults list
```

#### Settings > Sécurité > "Déverrouiller tout"
```
Entrer master PIN (6ch) → vérifier → supprimer tous Keychain "meeshy_lock_*" + vider UserDefaults list (master PIN conservé)
```

### 3.4 API `ConversationLockManager` (redesign)

```swift
// Master PIN (6 chiffres)
func hasMasterPin() -> Bool
func setMasterPin(_ pin: String)
func verifyMasterPin(_ pin: String) -> Bool
func removeMasterPin()                        // Seulement si lockedConversationIds().isEmpty

// PIN par conversation (4 chiffres)
func isLocked(_ conversationId: String) -> Bool
func setLock(conversationId: String, pin: String)
func verifyLock(conversationId: String, pin: String) -> Bool
func removeLock(conversationId: String)
func removeAllLocks()                         // Conserve le master PIN

// Liste
func lockedConversationIds() -> [String]
```

### 3.5 `ConversationLockSheet` — Modes redesignés

```swift
enum Mode {
    // Settings : configurer le master PIN
    case setupMasterPin

    // Settings : changer le master PIN (verify old → enter new → confirm)
    case changeMasterPin

    // Settings : supprimer le master PIN (verify → remove)
    case removeMasterPin

    // Verrouiller une conversation (3 étapes internes : verify master → enter 4ch → confirm 4ch)
    case lockConversation(conversationId: String)

    // Déverrouiller depuis le menu contextuel (enter 4ch → remove lock)
    case unlockConversation(conversationId: String)

    // Ouvrir une conversation verrouillée (enter 4ch → open)
    case openConversation(conversationId: String, onSuccess: () -> Void)

    // Settings : déverrouiller toutes les conversations (verify master → removeAllLocks)
    case unlockAll
}
```

### 3.6 SecurityView — Section "Conversations Verrouillées" (redesign)

```
[Icône] Conversations Verrouillées
[Badge] "Configuré ✓" ou "Non configuré"
[Info] "N conversation(s) verrouillée(s)"

── Si master PIN absent ──
  [Bouton] "Configurer le master PIN"  → Mode.setupMasterPin

── Si master PIN présent ──
  [Bouton] "Modifier le master PIN"    → Mode.changeMasterPin
  [Bouton] "Supprimer le master PIN"   → Mode.removeMasterPin  (visible seulement si 0 verrous)

  [Section] "Conversations verrouillées"
    [Row] <avatar> <nom conversation>   (une row par conversation verrouillée)
    [Bouton] "Déverrouiller tout"        → Mode.unlockAll  (visible seulement si N > 0)
```

---

## 4. Fichiers impactés

### Modification
- `apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift` — redesign complet
- `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift` — nouveaux modes + UI multi-étapes
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` — toggles swipe + règle block/archive
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift` — toggles context menu
- `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift` — section conversations verrouillées redesign

### Aucune modification requise
- `packages/MeeshySDK/` — le modèle `MeeshyConversation` est suffisant
- `services/gateway/` — le lock est local-only, pas de sync serveur
- `ConversationListViewModel.swift` — les actions toggles existent déjà, juste les libellés UI à corriger

---

## 5. Sécurité

- Tous les PINs stockés en Keychain avec `kSecAttrAccessibleWhenUnlocked`
- Valeurs stockées = SHA256 du PIN, jamais le PIN en clair
- Le Keychain iOS est protégé par Secure Enclave sur les appareils compatibles
- Aucune donnée de lock transmise au serveur (local-only)
