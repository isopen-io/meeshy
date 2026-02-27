# Conversation Toggles + Lock Security Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Uniformiser les toggles du menu contextuel/swipe et refondre le système de sécurité lock (master PIN 6ch + PIN 4ch par conversation).

**Architecture:** `ConversationLockManager` stocke 1 item Keychain par conversation verrouillée (`meeshy_lock_<id>`) + 1 item master PIN (`meeshy_master_pin`). `ConversationLockSheet` gère des flows multi-étapes via un `step: Int` interne. L'UI (swipe, context menu, SecurityView) reflète l'état courant et guide vers le bon mode.

**Tech Stack:** SwiftUI, SwiftUI `@State`, CryptoKit SHA256, Security framework (Keychain), XCTest

---

## Task 1 : Redesign `ConversationLockManager`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/ConversationLockManagerTests.swift`

### Step 1 : Écrire les tests (fichier à créer)

```swift
// apps/ios/MeeshyTests/Unit/Services/ConversationLockManagerTests.swift
import XCTest
@testable import Meeshy

@MainActor
final class ConversationLockManagerTests: XCTestCase {

    private var manager: ConversationLockManager!

    override func setUp() async throws {
        manager = ConversationLockManager.shared
        manager.removeAllLocks()
        if manager.hasMasterPin() { manager.forceRemoveMasterPin() }
    }

    override func tearDown() async throws {
        manager.removeAllLocks()
        if manager.hasMasterPin() { manager.forceRemoveMasterPin() }
        manager = nil
    }

    // MARK: - Master PIN

    func test_hasMasterPin_whenNoneSet_returnsFalse() {
        XCTAssertFalse(manager.hasMasterPin())
    }

    func test_setMasterPin_thenHasMasterPin_returnsTrue() {
        manager.setMasterPin("123456")
        XCTAssertTrue(manager.hasMasterPin())
    }

    func test_verifyMasterPin_withCorrectPin_returnsTrue() {
        manager.setMasterPin("123456")
        XCTAssertTrue(manager.verifyMasterPin("123456"))
    }

    func test_verifyMasterPin_withWrongPin_returnsFalse() {
        manager.setMasterPin("123456")
        XCTAssertFalse(manager.verifyMasterPin("654321"))
    }

    func test_forceRemoveMasterPin_removesPin() {
        manager.setMasterPin("123456")
        manager.forceRemoveMasterPin()
        XCTAssertFalse(manager.hasMasterPin())
    }

    // MARK: - Per-conversation lock

    func test_isLocked_whenNotLocked_returnsFalse() {
        XCTAssertFalse(manager.isLocked("conv-1"))
    }

    func test_setLock_thenIsLocked_returnsTrue() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertTrue(manager.isLocked("conv-1"))
    }

    func test_verifyLock_withCorrectPin_returnsTrue() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-1", pin: "1234"))
    }

    func test_verifyLock_withWrongPin_returnsFalse() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-1", pin: "9999"))
    }

    func test_removeLock_removesConversationLock() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1234")
        manager.removeLock(conversationId: "conv-1")
        XCTAssertFalse(manager.isLocked("conv-1"))
    }

    func test_removeAllLocks_removesAllConversations_keepsMasterPin() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        manager.removeAllLocks()
        XCTAssertFalse(manager.isLocked("conv-1"))
        XCTAssertFalse(manager.isLocked("conv-2"))
        XCTAssertTrue(manager.hasMasterPin())  // Master PIN conservé
    }

    func test_lockedConversationIds_reflectsCurrentLocks() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        XCTAssertEqual(manager.lockedConversationIds, ["conv-1", "conv-2"])
    }

    func test_eachConversationHasIndependentPin() {
        manager.setMasterPin("123456")
        manager.setLock(conversationId: "conv-1", pin: "1111")
        manager.setLock(conversationId: "conv-2", pin: "2222")
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-1", pin: "1111"))
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-1", pin: "2222"))
        XCTAssertTrue(manager.verifyLock(conversationId: "conv-2", pin: "2222"))
        XCTAssertFalse(manager.verifyLock(conversationId: "conv-2", pin: "1111"))
    }
}
```

### Step 2 : Vérifier que les tests compilent mais échouent

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh test
```
Attendu : erreurs de compilation (`hasMasterPin`, `setMasterPin`, `verifyLock`, etc. n'existent pas encore).

### Step 3 : Réécrire `ConversationLockManager.swift`

Remplacer entièrement le contenu du fichier :

```swift
// apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift
import Foundation
import CryptoKit
import Security

@MainActor
class ConversationLockManager: ObservableObject {
    static let shared = ConversationLockManager()

    @Published private(set) var lockedConversationIds: Set<String> = []

    private let keychainService = "me.meeshy.app.conversation-locks"
    private let masterPinKey = "meeshy_master_pin"
    private let lockedIdsDefaultsKey = "meeshy.lockedConversationIds"

    private init() {
        loadLockedIds()
    }

    // MARK: - Master PIN (6 digits)

    func hasMasterPin() -> Bool {
        readFromKeychain(key: masterPinKey) != nil
    }

    func setMasterPin(_ pin: String) {
        saveToKeychain(key: masterPinKey, value: sha256(pin))
    }

    func verifyMasterPin(_ pin: String) -> Bool {
        guard let stored = readFromKeychain(key: masterPinKey) else { return false }
        return sha256(pin) == stored
    }

    /// Supprime le master PIN. Ne pas appeler si des conversations sont verrouillées.
    func removeMasterPin() {
        guard lockedConversationIds.isEmpty else { return }
        deleteFromKeychain(key: masterPinKey)
    }

    /// Force la suppression du master PIN (pour tests / unlock all).
    func forceRemoveMasterPin() {
        deleteFromKeychain(key: masterPinKey)
    }

    // MARK: - Per-conversation PIN (4 digits)

    func isLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    func setLock(conversationId: String, pin: String) {
        saveToKeychain(key: lockKey(conversationId), value: sha256(pin))
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
    }

    func verifyLock(conversationId: String, pin: String) -> Bool {
        guard let stored = readFromKeychain(key: lockKey(conversationId)) else { return false }
        return sha256(pin) == stored
    }

    func removeLock(conversationId: String) {
        deleteFromKeychain(key: lockKey(conversationId))
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    func removeAllLocks() {
        for id in lockedConversationIds {
            deleteFromKeychain(key: lockKey(id))
        }
        lockedConversationIds.removeAll()
        saveLockedIds()
    }

    // MARK: - Private helpers

    private func lockKey(_ conversationId: String) -> String {
        "meeshy_lock_\(conversationId)"
    }

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Keychain

    private func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func readFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Persistence

    private func saveLockedIds() {
        UserDefaults.standard.set(Array(lockedConversationIds), forKey: lockedIdsDefaultsKey)
    }

    private func loadLockedIds() {
        let ids = UserDefaults.standard.stringArray(forKey: lockedIdsDefaultsKey) ?? []
        lockedConversationIds = Set(ids)
    }
}
```

### Step 4 : Lancer les tests

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh test
```
Attendu : tous les tests `ConversationLockManagerTests` passent.

### Step 5 : Commit

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift apps/ios/MeeshyTests/Unit/Services/ConversationLockManagerTests.swift
git commit -m "refactor(ios): redesign ConversationLockManager avec master PIN 6ch + PIN 4ch par conversation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2 : Redesign `ConversationLockSheet`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift`

### Step 1 : Remplacer entièrement le fichier

L'enum `Mode` passe de 4 à 7 cas. Un `step: Int` interne gère les flows multi-étapes. Le `pinLength` est dynamique selon `(mode, step)`.

```swift
// apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift
import SwiftUI
import MeeshySDK

struct ConversationLockSheet: View {
    enum Mode {
        case setupMasterPin           // Settings: entrer 6ch → confirmer 6ch → setMasterPin
        case changeMasterPin          // Settings: vérifier 6ch → entrer nouveau 6ch → confirmer
        case removeMasterPin          // Settings: vérifier 6ch → forceRemoveMasterPin
        case lockConversation         // Menu: vérifier master 6ch → entrer 4ch → confirmer 4ch
        case unlockConversation       // Menu: entrer 4ch → removeLock
        case openConversation         // Tap: entrer 4ch → onSuccess()
        case unlockAll                // Settings: vérifier master 6ch → removeAllLocks
    }

    let mode: Mode
    let conversationId: String?
    let conversationName: String
    let onSuccess: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager

    @State private var pin: String = ""
    @State private var confirmPin: String = ""
    @State private var step: Int = 0   // 0=first, 1=second, 2=third
    @State private var errorMessage: String?
    @State private var shakeOffset: CGFloat = 0

    private let lockManager = ConversationLockManager.shared

    // MARK: - Computed PIN length

    private var pinLength: Int {
        switch mode {
        case .setupMasterPin, .removeMasterPin, .unlockAll:
            return 6
        case .changeMasterPin:
            return 6  // tous les steps sont 6ch
        case .lockConversation:
            return step == 0 ? 6 : 4  // step 0: vérifier master (6), steps 1-2: code conversation (4)
        case .unlockConversation, .openConversation:
            return 4
        }
    }

    private var currentPin: String { step == 2 ? confirmPin : pin }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 28) {
            headerSection
            dotsRow
            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.red)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            numpad
            Spacer()
        }
        .presentationDetents([.height(500)])
        .presentationDragIndicator(.visible)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: errorMessage)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: step)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: iconName)
                .font(.system(size: 44))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.coral, MeeshyColors.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.top, 24)

            Text(titleText)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(subtitleText)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }

    // MARK: - Dots

    private var dotsRow: some View {
        HStack(spacing: 20) {
            ForEach(0..<pinLength, id: \.self) { index in
                Circle()
                    .fill(
                        index < currentPin.count
                            ? AnyShapeStyle(LinearGradient(
                                colors: [MeeshyColors.coral, MeeshyColors.purple],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                            : AnyShapeStyle(theme.textMuted.opacity(0.25))
                    )
                    .frame(width: 18, height: 18)
                    .scaleEffect(index < currentPin.count ? 1.15 : 1.0)
                    .animation(.spring(response: 0.2, dampingFraction: 0.6), value: currentPin.count)
            }
        }
        .offset(x: shakeOffset)
        .padding(.vertical, 4)
    }

    // MARK: - Numpad

    private var numpad: some View {
        VStack(spacing: 14) {
            ForEach([[1, 2, 3], [4, 5, 6], [7, 8, 9]], id: \.self) { row in
                HStack(spacing: 20) {
                    ForEach(row, id: \.self) { digit in
                        numpadKey(digit: digit)
                    }
                }
            }
            HStack(spacing: 20) {
                Color.clear.frame(width: 76, height: 76)
                numpadKey(digit: 0)
                Button {
                    HapticFeedback.light()
                    deleteLastDigit()
                } label: {
                    Image(systemName: "delete.left.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .frame(width: 76, height: 76)
                }
                .opacity(currentPin.isEmpty ? 0.3 : 1.0)
                .animation(.easeInOut(duration: 0.15), value: currentPin.isEmpty)
            }
        }
    }

    private func numpadKey(digit: Int) -> some View {
        Button {
            HapticFeedback.light()
            appendDigit(digit)
        } label: {
            Text("\(digit)")
                .font(.system(size: 26, weight: .medium, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .frame(width: 76, height: 76)
                .background(
                    Circle()
                        .fill(theme.mode.isDark
                              ? Color.white.opacity(0.09)
                              : Color.black.opacity(0.06))
                )
        }
        .disabled(currentPin.count >= pinLength)
    }

    // MARK: - Titles

    private var iconName: String {
        switch mode {
        case .setupMasterPin:
            return step == 1 ? "lock.shield.fill" : "lock.fill"
        case .changeMasterPin:
            return step == 0 ? "lock.fill" : (step == 1 ? "lock.rotation" : "lock.shield.fill")
        case .removeMasterPin:
            return "lock.open.fill"
        case .lockConversation:
            return step == 0 ? "lock.fill" : (step == 2 ? "lock.shield.fill" : "lock.fill")
        case .unlockConversation:
            return "lock.open.fill"
        case .openConversation:
            return "lock.fill"
        case .unlockAll:
            return "lock.open.fill"
        }
    }

    private var titleText: String {
        switch mode {
        case .setupMasterPin:
            return step == 0 ? "Créer le master PIN" : "Confirmer le master PIN"
        case .changeMasterPin:
            if step == 0 { return "Vérifier le master PIN" }
            if step == 1 { return "Nouveau master PIN" }
            return "Confirmer le nouveau PIN"
        case .removeMasterPin:
            return "Supprimer le master PIN"
        case .lockConversation:
            if step == 0 { return "Vérifier le master PIN" }
            if step == 1 { return "Code de la conversation" }
            return "Confirmer le code"
        case .unlockConversation:
            return "Déverrouiller"
        case .openConversation:
            return "Conversation verrouillée"
        case .unlockAll:
            return "Déverrouiller tout"
        }
    }

    private var subtitleText: String {
        switch mode {
        case .setupMasterPin:
            if step == 0 { return "Choisissez un master PIN à 6 chiffres pour sécuriser vos verrous" }
            return "Saisissez à nouveau votre master PIN pour confirmer"
        case .changeMasterPin:
            if step == 0 { return "Saisissez votre master PIN actuel" }
            if step == 1 { return "Choisissez un nouveau master PIN à 6 chiffres" }
            return "Confirmez votre nouveau master PIN"
        case .removeMasterPin:
            return "Saisissez votre master PIN pour confirmer la suppression"
        case .lockConversation:
            if step == 0 { return "Saisissez votre master PIN pour autoriser le verrouillage" }
            if step == 1 { return "Choisissez un code à 4 chiffres pour \(conversationName)" }
            return "Confirmez le code pour \(conversationName)"
        case .unlockConversation:
            return "Saisissez le code de \(conversationName) pour le déverrouiller"
        case .openConversation:
            return "Saisissez le code pour accéder à \(conversationName)"
        case .unlockAll:
            return "Saisissez votre master PIN pour déverrouiller toutes les conversations"
        }
    }

    // MARK: - Input logic

    private func appendDigit(_ digit: Int) {
        guard currentPin.count < pinLength else { return }
        errorMessage = nil
        if step == 2 {
            confirmPin += "\(digit)"
            if confirmPin.count == pinLength { handleComplete() }
        } else {
            pin += "\(digit)"
            if pin.count == pinLength { handleComplete() }
        }
    }

    private func deleteLastDigit() {
        if step == 2 {
            if !confirmPin.isEmpty { confirmPin.removeLast() }
        } else {
            if !pin.isEmpty { pin.removeLast() }
        }
    }

    private func handleComplete() {
        switch mode {

        case .setupMasterPin:
            if step == 0 {
                withAnimation { step = 2 }
            } else {  // step == 2 (confirming)
                guard pin == confirmPin else { return shakeAndReset("Les PIN ne correspondent pas") }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .changeMasterPin:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {  // step == 2
                guard pin == confirmPin else { return shakeAndReset("Les PIN ne correspondent pas") }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .removeMasterPin:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
            lockManager.forceRemoveMasterPin()
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .lockConversation:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {  // step == 2
                guard pin == confirmPin else { return shakeAndReset("Les codes ne correspondent pas") }
                guard let id = conversationId else { return }
                lockManager.setLock(conversationId: id, pin: pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .unlockConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset("Code incorrect")
            }
            lockManager.removeLock(conversationId: id)
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .openConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset("Code incorrect")
            }
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .unlockAll:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
            lockManager.removeAllLocks()
            HapticFeedback.success()
            onSuccess()
            dismiss()
        }
    }

    private func shakeAndReset(_ message: String) {
        errorMessage = message
        HapticFeedback.error()
        withAnimation(.default.repeatCount(4, autoreverses: true).speed(8)) {
            shakeOffset = 8
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            shakeOffset = 0
            pin = ""
            confirmPin = ""
            if step == 2 { step = step == 2 ? (mode == .changeMasterPin ? 1 : 1) : 0 }
        }
    }
}
```

**Note sur `shakeAndReset`** : Après une erreur en step 2 (confirmation), on revient au step précédent (`step = 1`) pour que l'utilisateur re-saisisse le PIN d'abord. Simplifier ainsi :

```swift
// Remplacer le DispatchQueue dans shakeAndReset :
DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
    shakeOffset = 0
    pin = ""
    confirmPin = ""
    // Revenir au step précédent si on était en confirmation (step 2)
    if step == 2 { step = 1 }
}
```

### Step 2 : Build pour vérifier compilation

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build
```
Attendu : erreurs de compilation dans `ConversationListView.swift` et `SecurityView.swift` (références aux anciens modes `.setPassword`, `.verifyPassword`, `.removePassword`, `.removeGlobalPin`). C'est attendu — ces fichiers seront corrigés dans les tâches suivantes.

### Step 3 : Commit (même si erreurs de compilation dans les consommateurs)

Ne pas commit à cette étape — les consommateurs sont cassés. Continuer vers Task 3.

---

## Task 3 : Mettre à jour `ConversationListView.swift`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

### Step 1 : Mettre à jour la déclaration de `lockSheetMode`

Ligne ~98 : changer le type de valeur initiale :
```swift
// AVANT
@State var lockSheetMode: ConversationLockSheet.Mode = .setPassword

// APRÈS
@State var lockSheetMode: ConversationLockSheet.Mode = .openConversation
```

Ajouter `@State var showNoMasterPinAlert = false` juste après (ligne ~100) :
```swift
@State var showNoMasterPinAlert = false
```

### Step 2 : Mettre à jour le `onTapGesture` (ligne ~197)

```swift
// AVANT
.onTapGesture {
    HapticFeedback.light()
    if ConversationLockManager.shared.isLocked(conversation.id) {
        lockSheetMode = .verifyPassword
        lockSheetConversation = conversation
    } else {
        onSelect(conversation)
    }
}

// APRÈS
.onTapGesture {
    HapticFeedback.light()
    if ConversationLockManager.shared.isLocked(conversation.id) {
        lockSheetMode = .openConversation
        lockSheetConversation = conversation
    } else {
        onSelect(conversation)
    }
}
```

### Step 3 : Mettre à jour `leadingSwipeActions` — action Lock (lignes ~277-294)

```swift
// AVANT
SwipeAction(
    icon: isLocked ? "lock.open.fill" : "lock.fill",
    label: isLocked
        ? String(localized: "swipe.unlock", defaultValue: "Déverrouiller")
        : String(localized: "swipe.lock", defaultValue: "Verrouiller"),
    color: Color(hex: "F59E0B")
) {
    if isLocked {
        lockSheetMode = .removePassword
        lockSheetConversation = conversation
    } else if lockManager.hasGlobalPin() {
        lockManager.setLock(conversationId: conversation.id)
        HapticFeedback.success()
    } else {
        lockSheetMode = .setPassword
        lockSheetConversation = conversation
    }
}

// APRÈS
SwipeAction(
    icon: isLocked ? "lock.open.fill" : "lock.fill",
    label: isLocked
        ? String(localized: "swipe.unlock", defaultValue: "Déverrouiller")
        : String(localized: "swipe.lock", defaultValue: "Verrouiller"),
    color: Color(hex: "F59E0B")
) {
    if isLocked {
        lockSheetMode = .unlockConversation
        lockSheetConversation = conversation
    } else if lockManager.hasMasterPin() {
        lockSheetMode = .lockConversation
        lockSheetConversation = conversation
    } else {
        showNoMasterPinAlert = true
    }
}
```

### Step 4 : Mettre à jour le `.sheet(item: $lockSheetConversation)` (lignes ~619-631)

```swift
// AVANT
.sheet(item: $lockSheetConversation) { conversation in
    ConversationLockSheet(
        mode: lockSheetMode,
        conversationId: conversation.id,
        conversationName: conversation.name,
        onSuccess: {
            if lockSheetMode == .verifyPassword {
                onSelect(conversation)
            }
        }
    )
    .environmentObject(theme)
}

// APRÈS
.sheet(item: $lockSheetConversation) { conversation in
    ConversationLockSheet(
        mode: lockSheetMode,
        conversationId: conversation.id,
        conversationName: conversation.name,
        onSuccess: {
            if case .openConversation = lockSheetMode {
                onSelect(conversation)
            }
        }
    )
    .environmentObject(theme)
}
```

### Step 5 : Ajouter l'alert "No Master PIN" après le `.sheet(item:)`

Trouver le bloc `.sheet(isPresented: $showWidgetPreview)` (juste après le sheet de lock) et ajouter **avant** ce bloc :

```swift
.alert("Master PIN requis", isPresented: $showNoMasterPinAlert) {
    Button("Configurer", role: .none) {
        // La navigation vers SecurityView est gérée par le parent — on émet juste un signal
        // Pour l'instant, dismiss et laisser l'utilisateur naviguer manuellement
    }
    Button("Annuler", role: .cancel) {}
} message: {
    Text("Configurez d'abord un master PIN dans Paramètres > Sécurité pour verrouiller des conversations.")
}
```

### Step 6 : Build

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build
```
Attendu : `ConversationListView.swift` compilé, erreurs restantes seulement dans `ConversationListView+Overlays.swift` et `SecurityView.swift`.

---

## Task 4 : Mettre à jour `ConversationListView+Overlays.swift`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift`

### Step 1 : Corriger l'action Archive dans le context menu (ligne ~141-148)

Le context menu affiche toujours "Archiver" même si la conversation est déjà archivée. Correction + règle block :

```swift
// AVANT
// Archive
Button {
    HapticFeedback.medium()
    Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
} label: {
    Label(String(localized: "context.archive", defaultValue: "Archiver"), systemImage: "archivebox.fill")
}

// APRÈS
// Archive / Unarchive (masqué si conversation bloquée)
let isBlocked = conversation.type == .direct
    && conversation.participantUserId.map { BlockService.shared.isBlocked(userId: $0) } ?? false
let isArchived = !conversation.isActive
if !(isArchived && isBlocked) {
    Button {
        HapticFeedback.medium()
        if isArchived {
            Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
        } else {
            Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
        }
    } label: {
        Label(
            isArchived
                ? String(localized: "context.unarchive", defaultValue: "Désarchiver")
                : String(localized: "context.archive", defaultValue: "Archiver"),
            systemImage: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill"
        )
    }
}
```

### Step 2 : Corriger l'action Lock dans le context menu (lignes ~125-139)

```swift
// AVANT
Button {
    HapticFeedback.medium()
    let isLocked = ConversationLockManager.shared.isLocked(conversation.id)
    lockSheetMode = isLocked ? .removePassword : .setPassword
    lockSheetConversation = conversation
} label: {
    let isLocked = ConversationLockManager.shared.isLocked(conversation.id)
    Label(
        isLocked
            ? String(localized: "context.unlock", defaultValue: "Déverrouiller")
            : String(localized: "context.lock", defaultValue: "Verrouiller"),
        systemImage: isLocked ? "lock.open.fill" : "lock.fill"
    )
}

// APRÈS
let isLockedCtx = ConversationLockManager.shared.isLocked(conversation.id)
Button {
    HapticFeedback.medium()
    if isLockedCtx {
        lockSheetMode = .unlockConversation
        lockSheetConversation = conversation
    } else if ConversationLockManager.shared.hasMasterPin() {
        lockSheetMode = .lockConversation
        lockSheetConversation = conversation
    } else {
        showNoMasterPinAlert = true
    }
} label: {
    Label(
        isLockedCtx
            ? String(localized: "context.unlock", defaultValue: "Déverrouiller")
            : String(localized: "context.lock", defaultValue: "Verrouiller"),
        systemImage: isLockedCtx ? "lock.open.fill" : "lock.fill"
    )
}
```

### Step 3 : Corriger l'action Block dans le context menu (lignes ~151-160)

Le context menu n'affichait pas "Débloquer" quand déjà bloqué. Correction :

```swift
// AVANT
if conversation.type == .direct, conversation.participantUserId != nil {
    Button(role: .destructive) {
        HapticFeedback.heavy()
        blockTargetConversation = conversation
        showBlockConfirmation = true
    } label: {
        Label(String(localized: "context.block", defaultValue: "Bloquer"), systemImage: "hand.raised.fill")
    }
}

// APRÈS
if conversation.type == .direct, let userId = conversation.participantUserId {
    let isBlockedCtx = BlockService.shared.isBlocked(userId: userId)
    if isBlockedCtx {
        Button {
            HapticFeedback.heavy()
            Task {
                try? await BlockService.shared.unblockUser(userId: userId)
                HapticFeedback.success()
            }
        } label: {
            Label(String(localized: "context.unblock", defaultValue: "Débloquer"), systemImage: "hand.raised.slash.fill")
        }
    } else {
        Button(role: .destructive) {
            HapticFeedback.heavy()
            blockTargetConversation = conversation
            showBlockConfirmation = true
        } label: {
            Label(String(localized: "context.block", defaultValue: "Bloquer"), systemImage: "hand.raised.fill")
        }
    }
}
```

### Step 4 : Build

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build
```
Attendu : `ConversationListView+Overlays.swift` compilé, seules erreurs restantes dans `SecurityView.swift`.

### Step 5 : Commit intermédiaire

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
    apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift \
    apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift \
    apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift
git commit -m "feat(ios): nouveaux modes ConversationLockSheet + toggles context menu uniformisés

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5 : Redesign `SecurityView` — section Conversations Verrouillées

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

### Step 1 : Mettre à jour les `@State` variables lock (lignes ~13-18)

```swift
// AVANT
// Conversation lock PIN
@ObservedObject private var lockManager = ConversationLockManager.shared
@State private var showPinSetupSheet = false
@State private var showPinVerifyForChange = false
@State private var showPinChangeSetup = false
@State private var showPinRemoveSheet = false

// APRÈS
// Conversation lock PIN
@ObservedObject private var lockManager = ConversationLockManager.shared
@State private var showPinSetupSheet = false       // setupMasterPin
@State private var showPinChangeSheet = false      // changeMasterPin (multi-step interne)
@State private var showPinRemoveSheet = false      // removeMasterPin
@State private var showUnlockAllSheet = false      // unlockAll
```

### Step 2 : Mettre à jour les `.sheet` modifiers (lignes ~53-97)

Remplacer les 4 anciens sheets par les nouveaux :

```swift
// Configurer le master PIN (premier setup)
.sheet(isPresented: $showPinSetupSheet) {
    ConversationLockSheet(
        mode: .setupMasterPin,
        conversationId: nil,
        conversationName: "",
        onSuccess: {}
    )
    .environmentObject(theme)
}
// Modifier le master PIN (multi-step interne au sheet)
.sheet(isPresented: $showPinChangeSheet) {
    ConversationLockSheet(
        mode: .changeMasterPin,
        conversationId: nil,
        conversationName: "",
        onSuccess: {}
    )
    .environmentObject(theme)
}
// Supprimer le master PIN
.sheet(isPresented: $showPinRemoveSheet) {
    ConversationLockSheet(
        mode: .removeMasterPin,
        conversationId: nil,
        conversationName: "",
        onSuccess: {}
    )
    .environmentObject(theme)
}
// Déverrouiller toutes les conversations
.sheet(isPresented: $showUnlockAllSheet) {
    ConversationLockSheet(
        mode: .unlockAll,
        conversationId: nil,
        conversationName: "",
        onSuccess: {}
    )
    .environmentObject(theme)
}
```

Supprimer aussi le sheet `showPinVerifyForChange` et `showPinChangeSetup` qui n'existent plus.

### Step 3 : Remplacer `conversationLockSection` (lignes ~517-609)

```swift
private var conversationLockSection: some View {
    let hasMasterPIN = lockManager.hasMasterPin()
    let lockedCount = lockManager.lockedConversationIds.count
    let lockColor = "FF6B6B"
    return VStack(alignment: .leading, spacing: 8) {
        sectionHeader(title: "Conversations verrouillées", icon: "lock.shield.fill", color: lockColor)

        VStack(spacing: 0) {
            // Status row
            HStack(spacing: 12) {
                fieldIcon("lock.shield.fill", color: lockColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Master PIN")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Text(hasMasterPIN ? "Configuré" : "Non configuré")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(hasMasterPIN ? Color(hex: "4ADE80") : theme.textMuted)
                }

                Spacer()

                if hasMasterPIN {
                    VStack(alignment: .trailing, spacing: 2) {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 16))
                            .foregroundColor(Color(hex: "4ADE80"))
                        if lockedCount > 0 {
                            Text("\(lockedCount) verrou\(lockedCount > 1 ? "s" : "")")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            // Actions
            VStack(spacing: 8) {
                HStack(spacing: 10) {
                    if !hasMasterPIN {
                        // Pas de master PIN → Configurer
                        Button {
                            HapticFeedback.medium()
                            showPinSetupSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill").font(.system(size: 12))
                                Text("Configurer le master PIN").font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color(hex: lockColor)))
                        }
                    } else {
                        // Master PIN configuré → Modifier
                        Button {
                            HapticFeedback.light()
                            showPinChangeSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "pencil.circle.fill").font(.system(size: 12))
                                Text("Modifier").font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(Color(hex: lockColor))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color(hex: lockColor).opacity(0.12)))
                        }

                        // Supprimer master PIN (seulement si 0 conversations verrouillées)
                        if lockedCount == 0 {
                            Button {
                                HapticFeedback.medium()
                                showPinRemoveSheet = true
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "trash.circle.fill").font(.system(size: 12))
                                    Text("Supprimer").font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(Color(hex: "EF4444"))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(Color(hex: "EF4444").opacity(0.10)))
                            }
                        }
                    }
                }

                // Déverrouiller tout (seulement si N > 0 conversations verrouillées)
                if hasMasterPIN && lockedCount > 0 {
                    Button {
                        HapticFeedback.heavy()
                        showUnlockAllSheet = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.open.fill").font(.system(size: 12))
                            Text("Déverrouiller tout (\(lockedCount))").font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color(hex: "F59E0B")))
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
        .background(sectionBackground(tint: lockColor))
    }
}
```

### Step 4 : Build final

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh build
```
Attendu : **build réussi, zéro erreur**.

### Step 5 : Commit final

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
    apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift \
    apps/ios/MeeshyTests/Unit/Services/ConversationLockManagerTests.swift \
    apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift \
    apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift \
    apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift \
    apps/ios/Meeshy/Features/Main/Views/SecurityView.swift
git commit -m "feat(ios): système de verrous conversations — master PIN 6ch + PIN 4ch individuel

- ConversationLockManager: master PIN Keychain (6ch) + PIN Keychain par conversation (4ch)
- ConversationLockSheet: 7 modes multi-étapes (setupMasterPin, changeMasterPin, lockConversation…)
- Toggles context menu uniformisés: archive↔désarchive, lock↔unlock, block↔déblock
- Règle: désarchiver bloqué si conversation bloquée
- SecurityView: section conversations verrouillées redesignée (unlock all, locked count, remove PIN)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6 : Vérification manuelle sur simulateur

### Step 1 : Lancer l'app

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh run
```

### Step 2 : Checklist de vérification

- [ ] Swipe gauche sur une conversation non-verrouillée → "Verrouiller" → redirige vers alert si pas de master PIN
- [ ] Settings > Sécurité → "Configurer le master PIN" → sheet 6ch + confirm
- [ ] Swipe gauche → "Verrouiller" → step 1 verify master (6ch) → step 2 code conv (4ch) → step 3 confirm → conversation verrouillée
- [ ] Tap conversation verrouillée → sheet 4ch → ouvre la conversation
- [ ] Swipe gauche conversation verrouillée → "Déverrouiller" → 4ch → déverrouillé
- [ ] Context menu → "Archiver" sur conversation active → archivée
- [ ] Context menu sur conversation archivée → affiche "Désarchiver"
- [ ] Context menu → "Bloquer" (DM) → conversation archivée, "Désarchiver" masqué
- [ ] Context menu sur conversation bloquée → affiche "Débloquer"
- [ ] Settings > Sécurité > Conversations Verrouillées → bouton "Déverrouiller tout" visible si N > 0 → master PIN → toutes déverrouillées
- [ ] Settings > Sécurité → "Modifier le master PIN" → old 6ch → new 6ch → confirm
- [ ] Settings > Sécurité → "Supprimer" visible seulement si 0 verrous

---

## Résumé des fichiers modifiés

| Fichier | Type | Changement principal |
|---------|------|---------------------|
| `Services/ConversationLockManager.swift` | Modify | Redesign complet API |
| `MeeshyTests/.../ConversationLockManagerTests.swift` | Create | Tests unitaires |
| `Components/ConversationLockSheet.swift` | Modify | 7 modes multi-étapes |
| `Views/ConversationListView.swift` | Modify | Nouveaux modes + alert no-master-PIN |
| `Views/ConversationListView+Overlays.swift` | Modify | Toggles archive/lock/block context menu |
| `Views/SecurityView.swift` | Modify | Section conversations verrouillées redesignée |
