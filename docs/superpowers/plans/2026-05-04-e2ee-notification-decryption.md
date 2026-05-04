# E2EE Notification Decryption — WhatsApp-Style

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les notifications push des messages E2EE affichent le contenu déchiffré (comme WhatsApp), au lieu d'un placeholder "Message chiffré". Le plaintext ne transite JAMAIS via APNs — le déchiffrement se fait localement dans le NSE.

**Architecture:** 
1. Gateway envoie le ciphertext dans le `data` payload push (pas dans `body`)
2. Le NSE iOS lit la clé E2EE depuis le Shared Keychain (App Group)
3. Le NSE déchiffre localement et met à jour `notification.body`
4. Le fallback si le NSE échoue : "Message chiffré" (déjà implémenté côté gateway)

**Tech Stack:** Swift 6.0, CryptoKit, Keychain Sharing (App Group), iOS 17+, TypeScript (gateway)

---

## Plan Review Checklist

| Check | Vérifié |
|-------|---------|
| App Group sur app principale : `group.me.meeshy.app` (entitlements ligne 17-19) | ✅ |
| App Group sur NSE : **MANQUANT** (`<array/>` dans MeeshyNotificationExtension.entitlements) | ❌ à corriger |
| Keychain access group sur app : `$(AppIdentifierPrefix)me.meeshy.app` | ✅ |
| Keychain access group sur NSE : **MANQUANT** | ❌ à corriger |
| `KeychainManager` accessibility : `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | ❌ trop restrictif pour NSE |
| `SessionManager` stocke les clés via `KeychainManager.shared.save(base64, forKey: prefix + peerId)` | ✅ |
| `E2EEService.shared.decrypt(combinedData:symmetricKey:)` disponible | ✅ mais dans le SDK |
| NSE ne peut pas importer MeeshySDK (trop lourd : Socket.IO, WebRTC, GRDB) | ✅ constraint documentée |
| NSEDataSync utilise déjà `group.me.meeshy.app` (ligne 17) | ✅ |
| Gateway `MessageProcessor` sanitize déjà E2EE → "Message chiffré" | ✅ (commit récent) |

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `apps/ios/MeeshyNotificationExtension/MeeshyNotificationExtension.entitlements` | Modify | Ajouter App Group + Keychain access group |
| `apps/ios/Meeshy.xcodeproj/project.pbxproj` | Auto-modified | Xcode syncs entitlements |
| `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift` | Modify | Changer accessibility + ajouter access group |
| `apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift` | Create | Déchiffrement E2EE léger (CryptoKit only, pas de MeeshySDK) |
| `apps/ios/MeeshyNotificationExtension/NotificationService.swift` | Modify | Appeler NSEDecryptor pour déchiffrer le body |
| `services/gateway/src/services/messaging/MessageProcessor.ts` | Modify | Envoyer ciphertext dans `data` payload |
| `services/gateway/src/services/notifications/NotificationService.ts` | Modify | Passer encryptedContent dans le push data |

---

### Task 1: Ajouter App Group et Keychain access group au NSE

Le NSE n'a pas accès au Keychain partagé ni au filesystem partagé. Sans ça, rien ne fonctionne.

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/MeeshyNotificationExtension.entitlements`

- [ ] **Step 1: Ajouter les entitlements manquants**

Remplacer le contenu de `MeeshyNotificationExtension.entitlements` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>development</string>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.me.meeshy.app</string>
	</array>
	<key>keychain-access-groups</key>
	<array>
		<string>$(AppIdentifierPrefix)me.meeshy.app</string>
	</array>
</dict>
</plist>
```

- [ ] **Step 2: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
feat(ios): add App Group and Keychain access group to NSE entitlements
```

---

### Task 2: Migrer le Keychain vers AfterFirstUnlock pour accès NSE background

`KeychainManager` utilise `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Le NSE peut tourner quand l'écran est verrouillé — il ne peut PAS lire des items `WhenUnlocked`. Il faut migrer vers `AfterFirstUnlockThisDeviceOnly` qui permet l'accès dès que l'utilisateur a déverrouillé une première fois après le boot.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`

- [ ] **Step 1: Changer l'accessibility**

Remplacer TOUTES les occurrences de `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` par `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` dans `KeychainManager.swift`.

Il y a 2 occurrences (lignes 44 et 51) :

```swift
// BEFORE:
kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,

// AFTER:
kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
```

- [ ] **Step 2: Ajouter le kSecAttrAccessGroup pour le partage**

Dans la propriété `query` de CHAQUE méthode (`save`, `load`, `delete`, `deleteAll`), ajouter le Keychain access group. Ajouter une propriété :

```swift
private let accessGroup = "\(Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String ?? "")me.meeshy.app"
```

ATTENTION : `Bundle.main` dans le NSE retourne le bundle du NSE, pas de l'app. Le `AppIdentifierPrefix` n'est pas disponible via `Bundle.main` dans le NSE.

**Approche plus fiable :** utiliser le `kSecAttrAccessGroup` tel quel avec le team ID hardcodé OU ne PAS ajouter `kSecAttrAccessGroup` — si l'app et le NSE ont le même `keychain-access-groups` dans les entitlements, les items sont déjà partagés automatiquement par le service name `me.meeshy.app`.

Vérifions : les deux entitlements ont `$(AppIdentifierPrefix)me.meeshy.app`. Le service name est le même (`me.meeshy.app`). Les items Keychain avec le même service + account + access group sont automatiquement partagés entre l'app et les extensions. **Pas besoin d'ajouter `kSecAttrAccessGroup` explicitement dans le code** — les entitlements suffisent.

Donc cette étape se réduit à : changer `WhenUnlocked` → `AfterFirstUnlock`.

- [ ] **Step 3: Migrer les items existants**

Les items Keychain existants avec `WhenUnlocked` ne seront PAS automatiquement mis à jour en `AfterFirstUnlock`. Il faut migrer. Ajouter une méthode de migration :

```swift
public func migrateAccessibility() {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecMatchLimit as String: kSecMatchLimitAll,
        kSecReturnAttributes as String: true,
        kSecReturnData as String: true,
    ]
    
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let items = result as? [[String: Any]] else { return }
    
    for item in items {
        guard let account = item[kSecAttrAccount as String] as? String,
              let data = item[kSecValueData as String] as? Data,
              let accessible = item[kSecAttrAccessible as String] as? String else { continue }
        
        // Skip if already migrated
        let afterFirstUnlock = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        guard accessible != afterFirstUnlock else { continue }
        
        // Delete old, re-add with new accessibility
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        
        var addQuery = deleteQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = afterFirstUnlock
        SecItemAdd(addQuery as CFDictionary, nil)
    }
}
```

Appeler `KeychainManager.shared.migrateAccessibility()` au démarrage de l'app (dans `MeeshyApp.init` ou `AppDelegate.application(_:didFinishLaunching:)`).

- [ ] **Step 4: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 5: Commit**

```
feat(sdk): migrate Keychain to AfterFirstUnlock for NSE background access

WhenUnlockedThisDeviceOnly prevented the Notification Service
Extension from reading E2EE keys when the device was locked.
AfterFirstUnlockThisDeviceOnly allows access after first unlock
post-boot, which covers the NSE use case.
```

---

### Task 3: Créer NSEDecryptor — module de déchiffrement léger pour le NSE

Le NSE ne peut pas importer MeeshySDK (trop lourd). Il faut un décrypteur léger qui utilise CryptoKit directement, avec la même logique que `E2EEService.shared.decrypt()`.

**Files:**
- Create: `apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift`

- [ ] **Step 1: Lire la logique de déchiffrement de E2EEService**

D'abord, lire `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Security/E2EEService.swift` pour comprendre le format du ciphertext et l'algorithme utilisé. Chercher la méthode `decrypt(combinedData:symmetricKey:)`. Noter :
- Comment le nonce est extrait du combinedData
- Quel algorithme (AES-GCM probablement via CryptoKit)
- Le format exact : `nonce (12 bytes) + ciphertext + tag (16 bytes)` ou `nonce + tag + ciphertext` ?

- [ ] **Step 2: Écrire NSEDecryptor**

```swift
import Foundation
import CryptoKit

/// Lightweight E2EE decryptor for the Notification Service Extension.
/// Mirrors the decrypt logic from E2EEService without importing MeeshySDK.
enum NSEDecryptor {
    
    /// Attempt to decrypt a message from the push payload.
    /// Returns the decrypted plaintext, or nil if decryption fails.
    static func decrypt(
        encryptedBase64: String,
        senderUserId: String
    ) -> String? {
        // 1. Read the session key from shared Keychain
        guard let sessionKey = loadSessionKey(for: senderUserId) else { return nil }
        
        // 2. Decode the ciphertext
        guard let combinedData = Data(base64Encoded: encryptedBase64) else { return nil }
        
        // 3. Decrypt using CryptoKit AES-GCM
        // Format: nonce (12 bytes) + ciphertext + tag (16 bytes)
        // NOTE: Verify this format matches E2EEService.decrypt()
        guard combinedData.count > 28 else { return nil } // 12 + min 1 + 16 - 1
        
        do {
            let sealedBox = try AES.GCM.SealedBox(combined: combinedData)
            let decryptedData = try AES.GCM.open(sealedBox, using: sessionKey)
            return String(data: decryptedData, encoding: .utf8)
        } catch {
            return nil
        }
    }
    
    /// Read the E2EE session key from the shared Keychain.
    /// Uses the same key format as SessionManager: "me.meeshy.e2ee.session.{userId}"
    private static func loadSessionKey(for userId: String) -> SymmetricKey? {
        let account = "me.meeshy.e2ee.session.\(userId)"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "me.meeshy.app",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let base64String = String(data: data, encoding: .utf8),
              let keyData = Data(base64Encoded: base64String)
        else { return nil }
        
        return SymmetricKey(data: keyData)
    }
}
```

IMPORTANT : Le format exact du `combinedData` (nonce + ciphertext + tag) DOIT correspondre à ce que `E2EEService.encrypt()` produit. Lire `E2EEService.swift` pour confirmer. Si le format est différent (ex: nonce séparé), adapter le code ci-dessus.

- [ ] **Step 3: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 4: Commit**

```
feat(ios): add NSEDecryptor for E2EE message decryption in Notification Service Extension
```

---

### Task 4: Modifier le NSE pour déchiffrer les messages E2EE

Le NSE doit lire le ciphertext depuis le `data` payload, le déchiffrer, et mettre à jour le `body` de la notification.

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

- [ ] **Step 1: Ajouter le déchiffrement dans didReceive**

Dans `NotificationService.didReceive(_:withContentHandler:)`, APRÈS la ligne `applyCategory(to: bestAttemptContent)` et AVANT le download avatar, ajouter :

```swift
// E2EE decryption: if the message is encrypted, decrypt locally
if let encryptedContent = userInfo["encryptedContent"] as? String,
   let senderId = userInfo["senderId"] as? String,
   !encryptedContent.isEmpty {
    if let decrypted = NSEDecryptor.decrypt(
        encryptedBase64: encryptedContent,
        senderUserId: senderId
    ) {
        bestAttemptContent.body = decrypted
    }
    // If decryption fails, the body stays as "Message chiffré" (set by gateway)
}
```

- [ ] **Step 2: Vérifier build**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`

- [ ] **Step 3: Commit**

```
feat(ios): decrypt E2EE messages in NSE for rich notification display
```

---

### Task 5: Gateway — envoyer encryptedContent dans le push data payload

Le gateway doit ajouter le `encryptedContent` (ciphertext) dans le `data` dict du push payload pour que le NSE puisse le déchiffrer.

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts`
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`

- [ ] **Step 1: Passer encryptedContent dans le context notification**

Dans `MessageProcessor.triggerAllNotifications()`, quand le `createMessageNotification` est appelé (ligne ~849), ajouter `encryptedContent` :

```typescript
// Dans l'appel à createMessageNotification, ajouter :
encryptedContent: message.encryptedContent || undefined,
```

Il faut que `createMessageNotification` accepte ce nouveau paramètre et le passe dans le `data` dict du push.

- [ ] **Step 2: Ajouter encryptedContent au data payload du push**

Dans `NotificationService.ts`, dans la section qui construit le `data` dict du push (lignes ~373-396), ajouter :

```typescript
data: {
    // ... existing fields
    encryptedContent: params.context.encryptedContent || '',
    // senderId is already present
},
```

Vérifier le type de `params.context` et ajouter `encryptedContent?: string` si nécessaire.

- [ ] **Step 3: Vérifier TypeScript compile**

Run: `cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```
feat(gateway): include encryptedContent in push notification data payload for NSE decryption
```

---

### Task 6: Retirer la notification pour les messages édités (si applicable)

Vérifier que le gateway n'envoie PAS de push notification quand un message est édité. L'investigation a montré que le flow edit ne passe pas par `triggerAllNotifications`, mais il faut confirmer.

**Files:**
- Read: `services/gateway/src/routes/conversations/messages-advanced.ts` (le handler PATCH pour edit)

- [ ] **Step 1: Vérifier qu'aucune notification n'est envoyée pour les éditions**

Lire le handler PATCH de l'édition de message. Chercher toute référence à `notificationService`, `pushService`, `createNotification`, ou `triggerNotification`. Si aucune référence n'existe, documenter que c'est correct et skip. Si une notification est envoyée, la supprimer.

- [ ] **Step 2: Si applicable, ajouter un collapse-id au push initial**

Pour préparer la future rétraction des notifications sur delete/edit, ajouter `apns-collapse-id: message-{messageId}` dans le push payload. Cela permettrait d'envoyer un silent push de mise à jour qui REMPLACE la notification existante.

Dans `PushNotificationService.sendViaAPNS()`, ajouter :

```typescript
if (payload.collapseId) {
    notification.collapseId = payload.collapseId;
}
```

Et dans `MessageProcessor.triggerAllNotifications()`, passer :

```typescript
collapseId: `message-${message.id}`,
```

Ceci est un "nice to have" — si ça complexifie trop, skip et documenter pour plus tard.

- [ ] **Step 3: Commit (si changements)**

```
feat(gateway): add apns-collapse-id for future notification update/retraction support
```

---

## Verification

Après toutes les tâches :

- [ ] **Build iOS**: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build`
- [ ] **Build gateway**: `cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit`
- [ ] **Test E2EE notif flow**:
  1. Envoyer un message E2EE d'un device A vers device B
  2. Device B reçoit une notification avec le contenu déchiffré (pas "Message chiffré")
  3. Le plaintext n'a JAMAIS transité en clair via APNs — seul le ciphertext est dans `data.encryptedContent`
  4. Si l'écran est verrouillé, le NSE peut quand même lire la clé Keychain (AfterFirstUnlock)
- [ ] **Test fallback**: Si la session E2EE n'existe pas (premier message), la notification affiche "Message chiffré"

## Ordre de Déploiement

**IMPORTANT :** Les tasks doivent être déployées dans cet ordre :

1. **Task 1 + 2** (entitlements + Keychain) — iOS build only, pas de changement serveur
2. **Task 3 + 4** (NSEDecryptor + NotificationService) — le NSE peut déchiffrer, mais le gateway n'envoie pas encore `encryptedContent`
3. **Task 5** (gateway) — le gateway commence à envoyer `encryptedContent` dans le push data

Si Task 5 est déployée AVANT Task 1-4, les notifications montreront "Message chiffré" (fallback) car le NSE ne sait pas encore déchiffrer. Pas de régression — c'est le comportement actuel.
