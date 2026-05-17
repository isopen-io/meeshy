# iOS — Conversations non lues + aperçu d'effet du dernier message — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguer visuellement les conversations non lues (titre en gras, badge rouge thématisé) et décrire l'effet du dernier message au lieu d'exposer un contenu masqué, dans la liste des conversations et les résultats de recherche.

**Architecture:** Une fonction pure testable (`MeeshyConversation.lastMessageSummaryKind(now:)`, dans MeeshySDK) résout le type de résumé du dernier message. Deux écrans SwiftUI existants (`ThemedConversationRow`, `GlobalSearchView`) consomment cette décision et la rendent avec leur propre style. Aucun changement backend ni de modèle de données.

**Tech Stack:** Swift 6, SwiftUI, Swift Package Manager. Tests SDK en Swift Testing (`@Test`, `#expect`). Build app via `./apps/ios/meeshy.sh`.

**Spec de référence :** `docs/superpowers/specs/2026-05-17-ios-conversation-unread-effect-preview-design.md`

---

## File Structure

| Fichier | Rôle | Tâche |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift` | **Nouveau** — enum + résolution pure | Task 1 |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LastMessageSummaryKindTests.swift` | **Nouveau** — tests Swift Testing | Task 1 |
| `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift` | Modifié — couleur rouge sombre + helper badge | Task 2 |
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | Modifié — titre gras, badge rouge, rendu d'effet | Task 3 |
| `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` | Modifié — rendu d'effet dans les résultats | Task 4 |

Les deux fichiers nouveaux sont dans le package SPM `MeeshySDK` → **aucune édition de `project.pbxproj`**. Les fichiers de l'app modifiés existent déjà dans `project.pbxproj`.

---

## Task 1: Résolution pure `LastMessageSummaryKind` (MeeshySDK)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LastMessageSummaryKindTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/LastMessageSummaryKindTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

@Suite("LastMessageSummaryKind")
struct LastMessageSummaryKindTests {

    private func makeConversation(
        blurred: Bool = false,
        viewOnce: Bool = false,
        expiresAt: Date? = nil
    ) -> MeeshyConversation {
        MeeshyConversation(
            identifier: "conv-test",
            lastMessagePreview: "Texte du dernier message",
            lastMessageIsBlurred: blurred,
            lastMessageIsViewOnce: viewOnce,
            lastMessageExpiresAt: expiresAt
        )
    }

    @Test("Aucun effet → standard")
    func standard() {
        #expect(makeConversation().lastMessageSummaryKind() == .standard)
    }

    @Test("Message flouté → hidden")
    func blurred() {
        #expect(makeConversation(blurred: true).lastMessageSummaryKind() == .hidden)
    }

    @Test("Message vue-unique → viewOnce")
    func viewOnce() {
        #expect(makeConversation(viewOnce: true).lastMessageSummaryKind() == .viewOnce)
    }

    @Test("Expiration passée → expired")
    func expiredInPast() {
        let now = Date()
        let conv = makeConversation(expiresAt: now.addingTimeInterval(-60))
        #expect(conv.lastMessageSummaryKind(now: now) == .expired)
    }

    @Test("Expiration future → ephemeralActive")
    func ephemeralActive() {
        let now = Date()
        let conv = makeConversation(expiresAt: now.addingTimeInterval(60))
        #expect(conv.lastMessageSummaryKind(now: now) == .ephemeralActive)
    }

    @Test("Expiration passée prime sur flouté")
    func expiredBeatsBlurred() {
        let now = Date()
        let conv = makeConversation(blurred: true, expiresAt: now.addingTimeInterval(-60))
        #expect(conv.lastMessageSummaryKind(now: now) == .expired)
    }

    @Test("Flouté prime sur vue-unique")
    func blurredBeatsViewOnce() {
        #expect(makeConversation(blurred: true, viewOnce: true).lastMessageSummaryKind() == .hidden)
    }

    @Test("Flouté prime sur éphémère encore actif")
    func blurredBeatsEphemeralActive() {
        let now = Date()
        let conv = makeConversation(blurred: true, expiresAt: now.addingTimeInterval(60))
        #expect(conv.lastMessageSummaryKind(now: now) == .hidden)
    }
}
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/LastMessageSummaryKindTests -quiet
```
Expected: ÉCHEC de compilation — `value of type 'MeeshyConversation' has no member 'lastMessageSummaryKind'` et `cannot find 'LastMessageSummaryKind' in scope`.

- [ ] **Step 3: Créer l'implémentation minimale**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift` :

```swift
import Foundation

/// Décrit comment résumer le dernier message d'une conversation dans une ligne de liste.
/// La décision est centralisée ici pour être partagée entre la liste des conversations
/// et les résultats de recherche, et testable indépendamment de la couche UI.
public enum LastMessageSummaryKind: Sendable, Equatable {
    /// Contenu affichable normalement (texte / pièces jointes).
    case standard
    /// Message flouté — le contenu ne doit pas être exposé.
    case hidden
    /// Message vue-unique — le contenu ne doit pas être exposé.
    case viewOnce
    /// Message éphémère dont la date d'expiration est dépassée.
    case expired
    /// Message éphémère encore lisible (expiration future).
    case ephemeralActive
}

extension MeeshyConversation {
    /// Résout le type de résumé à afficher pour le dernier message de la conversation.
    /// - Parameter now: instant de référence (injectable pour les tests).
    public func lastMessageSummaryKind(now: Date = Date()) -> LastMessageSummaryKind {
        if let expiresAt = lastMessageExpiresAt, expiresAt <= now {
            return .expired
        }
        if lastMessageIsBlurred {
            return .hidden
        }
        if lastMessageIsViewOnce {
            return .viewOnce
        }
        if let expiresAt = lastMessageExpiresAt, expiresAt > now {
            return .ephemeralActive
        }
        return .standard
    }
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/LastMessageSummaryKindTests -quiet
```
Expected: `TEST SUCCEEDED` — 8 tests passent.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/LastMessageSummaryKindTests.swift
git commit -m "feat(ios): add LastMessageSummaryKind — pure last-message effect resolution"
```

---

## Task 2: Couleur de badge rouge thématisée (MeeshyColors)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift:38` (zone Semantic State Colors)

Cette tâche est du styling pur (constantes de couleur) — sa logique consommatrice est testée en Task 1 ; vérification ici par build.

- [ ] **Step 1: Ajouter la constante et le helper**

Dans `MeeshyColors.swift`, repérer le bloc `// MARK: - Semantic State Colors` (lignes 35-42). Juste **après** la ligne `public static let pinnedBlue = Color(hex: "3B82F6")` (ligne 42), insérer :

```swift

    /// Variante sombre du rouge sémantique — fond du badge de non-lus en dark mode.
    public static let errorDark = Color(hex: "991B1B")

    /// Fond du badge de compteur de messages non lus, thématisé.
    /// Light : rouge vif (`error`). Dark : rouge foncé (`errorDark`).
    public static func unreadBadgeBackground(isDark: Bool) -> Color {
        isDark ? errorDark : error
    }
```

(La `struct MeeshyColors` est déjà déclarée `public nonisolated` ligne 3 — la constante et la fonction héritent de `nonisolated`, aucune annotation supplémentaire requise.)

- [ ] **Step 2: Vérifier que le SDK compile**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
swift build
```
Expected: `Build complete!` sans erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift
git commit -m "feat(ios): add errorDark + unreadBadgeBackground to MeeshyColors"
```

---

## Task 3: Ligne de conversation — titre gras, badge rouge, rendu d'effet

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

Styling + câblage du helper testé en Task 1. Pas de test unitaire ici (vue SwiftUI) — vérification par build app et contrôle visuel light/dark.

- [ ] **Step 1: Ajouter l'import MeeshyUI**

En tête de fichier, après la ligne 2 (`import MeeshySDK`), ajouter :

```swift
import MeeshyUI
```

Le fichier doit donc commencer par :
```swift
import SwiftUI
import MeeshySDK
import MeeshyUI
```

- [ ] **Step 2: Remplacer l'enum privé `LastMessageEffect` par le helper SDK**

Remplacer **intégralement** le bloc des lignes 109-134 :

```swift
    // MARK: - Last Message Effect State

    private enum LastMessageEffect {
        case expired
        case blurred
        case viewOnce
        case ephemeralActive
        case none
    }

    private var lastMessageEffect: LastMessageEffect {
        let now = Date()
        if let expiresAt = conversation.lastMessageExpiresAt, expiresAt <= now {
            return .expired
        }
        if conversation.lastMessageIsBlurred {
            return .blurred
        }
        if conversation.lastMessageIsViewOnce {
            return .viewOnce
        }
        if let expiresAt = conversation.lastMessageExpiresAt, expiresAt > now {
            return .ephemeralActive
        }
        return .none
    }
```

par :

```swift
    // MARK: - Last Message Summary

    private var lastMessageSummary: LastMessageSummaryKind {
        conversation.lastMessageSummaryKind()
    }
```

- [ ] **Step 3: Mettre le titre en gras pour les conversations non lues**

Ligne 152, remplacer :

```swift
                            .font(.system(size: 15, weight: .semibold))
```

par :

```swift
                            .font(.system(size: 15, weight: conversation.unreadCount > 0 ? .bold : .semibold))
```

- [ ] **Step 4: Mettre le badge de non-lus en rouge thématisé**

Remplacer **intégralement** le bloc `unreadBadge` (lignes 337-355) :

```swift
    // MARK: - Unread Badge
    private var unreadBadge: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [accent, accentSecondary],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 24, height: 24)
                .shadow(color: accent.opacity(0.25), radius: 3)

            Text("\(min(conversation.unreadCount, 99))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
    }
```

par :

```swift
    // MARK: - Unread Badge
    private var unreadBadge: some View {
        let badgeColor = MeeshyColors.unreadBadgeBackground(isDark: isDark)
        return ZStack {
            Circle()
                .fill(badgeColor)
                .frame(width: 24, height: 24)
                .shadow(color: badgeColor.opacity(0.25), radius: 3)

            Text("\(min(conversation.unreadCount, 99))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
    }
```

- [ ] **Step 5: Adapter le label d'accessibilité aux nouveaux cas**

Remplacer **intégralement** le `switch` dans `conversationAccessibilityLabel` (lignes 242-257) :

```swift
        switch lastMessageEffect {
        case .expired:
            parts.append("dernier message expiré")
        case .blurred:
            parts.append("dernier message flouté")
        case .viewOnce:
            parts.append("dernier message : voir une fois")
        case .ephemeralActive:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append("dernier message éphémère : \(preview)")
            }
        case .none:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append("dernier message: \(preview)")
            }
        }
```

par :

```swift
        switch lastMessageSummary {
        case .expired:
            parts.append("dernier message expiré")
        case .hidden:
            parts.append("dernier message masqué")
        case .viewOnce:
            parts.append("dernier message : voir une fois")
        case .ephemeralActive:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append("dernier message éphémère : \(preview)")
            }
        case .standard:
            if let preview = conversation.lastMessagePreview, !preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append("dernier message: \(preview)")
            }
        }
```

- [ ] **Step 6: Décrire l'effet dans l'aperçu du dernier message**

Remplacer **intégralement** `lastMessagePreviewView` (lignes 440-497) :

```swift
    @ViewBuilder
    private var lastMessagePreviewView: some View {
        if typingUsername != nil {
            typingIndicatorView
        } else {
            switch lastMessageEffect {
            case .expired:
                HStack(spacing: 4) {
                    Image(systemName: "timer.badge.xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textMuted)
                    Text(String(localized: "message.expired", defaultValue: "Message expiré"))
                        .font(.system(size: 13).italic())
                        .foregroundColor(textMuted)
                        .lineLimit(1)
                }

            case .blurred:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "eye.slash")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textSecondary)
                    Text(conversation.lastMessagePreview ?? "")
                        .font(.system(size: 13))
                        .foregroundColor(textSecondary)
                        .lineLimit(1)
                        .blur(radius: 4)
                }

            case .viewOnce:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "flame")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(accent)
                    Text(String(localized: "message.view_once", defaultValue: "Voir une fois"))
                        .font(.system(size: 13))
                        .foregroundColor(accent)
                        .lineLimit(1)
                }

            case .ephemeralActive:
                standardMessageContent(showEphemeralIcon: true)

            case .none:
                let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let attachments = conversation.lastMessageAttachments
                if hasText || !attachments.isEmpty {
                    standardMessageContent(showEphemeralIcon: false)
                } else {
                    Text("")
                        .font(.system(size: 13))
                        .foregroundColor(textSecondary)
                }
            }
        }
    }
```

par :

```swift
    @ViewBuilder
    private var lastMessagePreviewView: some View {
        if typingUsername != nil {
            typingIndicatorView
        } else {
            switch lastMessageSummary {
            case .expired:
                HStack(spacing: 4) {
                    Image(systemName: "timer.badge.xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textMuted)
                    Text(String(localized: "message.expired", defaultValue: "Message expiré"))
                        .font(.system(size: 13).italic())
                        .foregroundColor(textMuted)
                        .lineLimit(1)
                }

            case .hidden:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "eye.slash")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textSecondary)
                    Text(String(localized: "conversation.summary.hidden", defaultValue: "1 message caché"))
                        .font(.system(size: 13).italic())
                        .foregroundColor(textSecondary)
                        .lineLimit(1)
                }

            case .viewOnce:
                HStack(spacing: 4) {
                    senderLabel
                    Image(systemName: "flame")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(accent)
                    Text(String(localized: "conversation.summary.view_once", defaultValue: "1 message vue unique"))
                        .font(.system(size: 13).italic())
                        .foregroundColor(accent)
                        .lineLimit(1)
                }

            case .ephemeralActive:
                standardMessageContent(showEphemeralIcon: true)

            case .standard:
                let hasText = !(conversation.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let attachments = conversation.lastMessageAttachments
                if hasText || !attachments.isEmpty {
                    standardMessageContent(showEphemeralIcon: false)
                } else {
                    Text("")
                        .font(.system(size: 13))
                        .foregroundColor(textSecondary)
                }
            }
        }
    }
```

- [ ] **Step 7: Builder l'app et vérifier**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
```
Expected: build réussi, aucune erreur de compilation. Aucune référence résiduelle à `LastMessageEffect` ou `lastMessageEffect`.

- [ ] **Step 8: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
git commit -m "feat(ios): unread conversations — bold title, red badge, effect-aware preview"
```

---

## Task 4: Résultats de recherche — décrire les effets masqués

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` (struct `GlobalSearchView`, méthode `conversationResultRow` ~lignes 446-514)

`GlobalSearchView` importe déjà `MeeshySDK` et `MeeshyUI`. `GlobalSearchConversationResult` expose un `conversation: Conversation` complet (= `MeeshyConversation`) portant les champs blur / view-once / expiry.

- [ ] **Step 1: Remplacer le rendu brut de l'aperçu**

Dans `conversationResultRow`, remplacer le bloc des lignes 493-498 :

```swift
                if let preview = result.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
```

par :

```swift
                conversationLastMessageLabel(result)
```

- [ ] **Step 2: Ajouter la vue d'aperçu effect-aware**

Juste **après** la fin de la fonction `conversationResultRow` (après l'accolade fermante ligne 514, avant `// MARK: - Users Results`), insérer :

```swift

    @ViewBuilder
    private func conversationLastMessageLabel(_ result: GlobalSearchConversationResult) -> some View {
        switch result.conversation.lastMessageSummaryKind() {
        case .hidden:
            HStack(spacing: 4) {
                Image(systemName: "eye.slash")
                    .font(.system(size: 11, weight: .medium))
                Text(String(localized: "conversation.summary.hidden", defaultValue: "1 message caché"))
                    .font(.system(size: 13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .viewOnce:
            HStack(spacing: 4) {
                Image(systemName: "flame")
                    .font(.system(size: 11, weight: .medium))
                Text(String(localized: "conversation.summary.view_once", defaultValue: "1 message vue unique"))
                    .font(.system(size: 13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .expired:
            HStack(spacing: 4) {
                Image(systemName: "timer.badge.xmark")
                    .font(.system(size: 11, weight: .medium))
                Text(String(localized: "message.expired", defaultValue: "Message expiré"))
                    .font(.system(size: 13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .ephemeralActive, .standard:
            if let preview = result.lastMessagePreview, !preview.isEmpty {
                Text(preview)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        }
    }
```

- [ ] **Step 3: Builder l'app et vérifier**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
```
Expected: build réussi, aucune erreur.

- [ ] **Step 4: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift
git commit -m "feat(ios): describe hidden last-message effects in search results"
```

---

## Task 5: Vérification finale

**Files:** aucun — vérification d'intégration.

- [ ] **Step 1: Suite de tests SDK complète**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```
Expected: `TEST SUCCEEDED` — y compris les 8 tests `LastMessageSummaryKindTests`, sans régression.

- [ ] **Step 2: Build app propre**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
```
Expected: build réussi.

- [ ] **Step 3: Suite de tests app**

Run :
```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh test
```
Expected: tous les tests passent, aucune régression.

- [ ] **Step 4: Contrôle visuel (manuel)**

Lancer l'app (`./apps/ios/meeshy.sh run`) et vérifier :
- Une conversation avec messages non lus : titre en **gras**, badge rouge vif (light) / rouge foncé (dark), chiffre blanc.
- Une conversation sans non-lus : titre `.semibold`, pas de badge.
- Un dernier message flouté : aperçu « 1 message caché » + icône œil barré, **aucun texte deviné**.
- Un dernier message vue-unique : aperçu « 1 message vue unique » + icône flamme.
- Un dernier message éphémère encore actif : contenu lisible + icône minuterie (inchangé).
- Recherche globale : un résultat dont le dernier message est flouté / vue-unique affiche le libellé d'effet et non le texte brut.

---

## Notes

- **Localisation** : les chaînes `conversation.summary.hidden` et `conversation.summary.view_once` sont déclarées via `String(localized:defaultValue:)` ; Xcode les extrait automatiquement au build. Aucune édition manuelle de catalogue `.xcstrings`. `message.expired` existe déjà.
- **Aucune édition `project.pbxproj`** : les deux fichiers nouveaux sont dans le package SPM `MeeshySDK` (auto-découvert). Les fichiers de l'app modifiés y sont déjà référencés.
- **Commits** : pas de trailer `Co-Authored-By` (préférence projet).
