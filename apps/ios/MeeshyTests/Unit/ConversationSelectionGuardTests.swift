import XCTest
@testable import Meeshy

/// **#4005 — sélection multiple de messages, plafonnée à 100, transfert
/// groupé.**
///
/// Même patron que `ConversationEditDraftGuardTests`/
/// `ConversationLongPressMenuGuardTests` : garde de SOURCE, suite tournée
/// sans UIKit réel (R5/R15).
final class ConversationSelectionGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    // MARK: - Le plafond est bien 100 (retour porteur 2026-08-27)

    func test_selectionCap_is100() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("static let selectionCap = 100"),
            "Le plafond de sélection doit être EXACTEMENT 100 — retour porteur explicite."
        )
    }

    // MARK: - `toggleMessageSelection` respecte le plafond, jamais un dépassement silencieux

    func test_toggleMessageSelection_refusesBeyondTheCap_withFeedback() throws {
        let code = try source("Features/Main/Views/ConversationView+Selection.swift")
        guard let fn = body(of: "func toggleMessageSelection(", in: code) else {
            return XCTFail("`toggleMessageSelection` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.selectedMessageIds.count < ConversationOverlayState.selectionCap"),
            "`toggleMessageSelection` doit vérifier le plafond AVANT d'insérer un id supplémentaire."
        )
        XCTAssertTrue(
            fn.contains("HapticFeedback.error()") && fn.contains("FeedbackToastManager.shared.showError"),
            "Dépasser le plafond doit être SIGNALÉ (haptique + toast), jamais un no-op silencieux."
        )
    }

    // MARK: - `beginSelectionMode` sème le premier message, un seul point d'entrée

    func test_beginSelectionMode_seedsTheFirstMessage() throws {
        let code = try source("Features/Main/Views/ConversationView+Selection.swift")
        guard let fn = body(of: "func beginSelectionMode(", in: code) else {
            return XCTFail("`beginSelectionMode` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.selectedMessageIds = [messageId]"),
            "`beginSelectionMode` doit semer la sélection avec le message qui a déclenché l'entrée en mode."
        )
        XCTAssertTrue(
            fn.contains("overlayState.isSelectionModeActive = true"),
            "`beginSelectionMode` doit activer le mode sélection."
        )
    }

    func test_bothMenuSites_callBeginSelectionMode() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        let occurrences = code.components(separatedBy: "beginSelectionMode(seedingWith:").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 2,
            "Les DEUX sites d'entrée (menu longpress custom « Plus… », menu natif iOS 26+) doivent appeler "
                + "`beginSelectionMode(seedingWith:)` — point d'entrée unique."
        )
    }

    // MARK: - `endSelectionMode` vide la sélection — jamais résiduelle

    func test_endSelectionMode_clearsTheSelection() throws {
        let code = try source("Features/Main/Views/ConversationView+Selection.swift")
        guard let fn = body(of: "func endSelectionMode(", in: code) else {
            return XCTFail("`endSelectionMode` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.isSelectionModeActive = false"),
            "`endSelectionMode` doit désactiver le mode sélection."
        )
        XCTAssertTrue(
            fn.contains("overlayState.selectedMessageIds = []"),
            "`endSelectionMode` doit vider la sélection — sinon elle réapparaîtrait au prochain longpress."
        )
    }

    // MARK: - Le mode sélection remplace le composer, jamais un bandeau EN PLUS

    func test_selectionToolbar_replacesTheComposer_ratherThanStackingOnIt() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("if overlayState.isSelectionModeActive {"),
            "Le mode sélection doit être vérifié EN PREMIER dans la branche composer/bandeaux."
        )
        guard let branch = body(of: "if overlayState.isSelectionModeActive {", in: code) else {
            return XCTFail("Branche introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            branch.contains("selectionToolbar"),
            "La branche sélection doit peindre `selectionToolbar`."
        )
    }

    // MARK: - Le transfert groupé réutilise la feuille EXISTANTE, jamais une seconde porte

    func test_forwardAction_reusesTheExistingForwardSheet() throws {
        let code = try source("Features/Main/Views/ConversationView+Selection.swift")
        guard let toolbar = body(of: "var selectionToolbar: some View {", in: code) else {
            return XCTFail("`selectionToolbar` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolbar.contains("composerState.forwardMessage = first"),
            "Le transfert groupé doit réutiliser `composerState.forwardMessage` — la SEULE feuille de "
                + "transfert du dépôt, jamais une seconde porte (loi 6)."
        )
        XCTAssertTrue(
            toolbar.contains("composerState.forwardAdditionalMessages = Array(selected.dropFirst())"),
            "Les messages 2..N de la sélection doivent voyager par `forwardAdditionalMessages`."
        )
    }

    func test_forwardPickerSheet_receivesAdditionalMessages_atItsExistingMountSite() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        // Ancre sur l'instanciation elle-même, pas sur `.sheet(...onDismiss: {`
        // — ce closure `onDismiss` referme sur SA PROPRE accolade avant que
        // `body(of:)` (brace-matché) atteigne le closure trailing suivant qui
        // monte `ForwardPickerSheet`.
        guard let call = body(of: "ForwardPickerSheet(", in: code) else {
            return XCTFail("Site de montage de `ForwardPickerSheet` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            call.contains("additionalMessages: composerState.forwardAdditionalMessages"),
            "Le site de montage EXISTANT de `ForwardPickerSheet` doit transmettre `forwardAdditionalMessages` "
                + "— pas un second site de montage."
        )
    }

    // MARK: - `ForwardPickerSheet.perform` envoie TOUS les messages sélectionnés

    func test_forwardPickerSheet_perform_sendsEveryMessage() throws {
        let code = try source("Features/Main/Components/ForwardPickerSheet.swift")
        guard let fn = body(of: "private func perform(_ target: ForwardTarget) async {", in: code) else {
            return XCTFail("`perform` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("for messageToSend in [message] + additionalMessages"),
            "`perform` doit envoyer TOUS les messages ([message] + additionalMessages), pas seulement le "
                + "premier — sinon un transfert groupé n'en enverrait qu'un."
        )
    }

    // MARK: - Le tap-catcher de sélection se pose PAR-DESSUS le contenu de la bulle

    func test_bubbleRow_selectionTapCatcher_sitsAboveContent() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` de `BubbleSwipeContainer` introuvable — la garde ne mesurerait rien.")
        }
        guard let contentRange = bodyBlock.range(of: "content()"),
              let catcherRange = bodyBlock.range(of: "if isSelectionModeActive {") else {
            return XCTFail("`content()`/capteur de sélection introuvables dans `body`.")
        }
        XCTAssertTrue(
            contentRange.lowerBound < catcherRange.lowerBound,
            "Le capteur de sélection doit être un enfant du `ZStack` APRÈS `content()` — sinon il serait "
                + "recouvert par la bulle au lieu de la recouvrir."
        )
    }

    func test_bubbleRow_disablesSwipeAndLongPress_duringSelection() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("including: isSelectionModeActive ? .none : .all"),
            "Le swipe reply/forward doit être désactivé pendant la sélection — une seule intention à la fois."
        )
        XCTAssertTrue(
            bodyBlock.contains("enableLongPress && !isSelectionModeActive"),
            "Le longpress custom doit être désactivé pendant la sélection."
        )
    }

    // MARK: - Le frame réel voyage jusqu'au contrôleur (didSet gardé, même patron que `readingMode`)

    func test_selectionProperties_useGuardedDidSet() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let block = body(of: "var isSelectionModeActive: Bool = false {", in: code) else {
            return XCTFail("`isSelectionModeActive` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            block.contains("guard oldValue != isSelectionModeActive, isViewLoaded else { return }"),
            "`didSet` doit être GARDÉ (même patron que `readingMode`) — sans lui, `applySnapshot` "
                + "rejouerait à chaque tick SwiftUI, y compris à chaque frappe dans le composer."
        )
    }
}
