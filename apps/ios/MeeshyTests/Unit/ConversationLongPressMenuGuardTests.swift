import XCTest
@testable import Meeshy

/// **#4004 — le menu longpress custom ferme le clavier et remonte le message
/// vers le centre s'il est trop bas.**
///
/// Périmètre : le menu longpress CUSTOM (`MessageOverlayMenu`, < iOS 26)
/// piloté par `overlayState.showOverlayMenu`. Le menu NATIF (`.contextMenu`,
/// iOS 26+) est présenté par le système sans point d'interception AVANT
/// ouverture — hors périmètre de cette garde.
///
/// Même patron que `ConversationEditDraftGuardTests` : garde de SOURCE,
/// suite tournée sans UIKit réel (R5/R15).
final class ConversationLongPressMenuGuardTests: XCTestCase {

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

    // MARK: - `presentLongPressMenu` ferme le clavier AVANT de présenter

    func test_presentLongPressMenu_dismissesKeyboardAndOptionsBeforePresenting() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("isTyping = false"),
            "`presentLongPressMenu` doit fermer le clavier (`isTyping = false`) avant de présenter le menu."
        )
        XCTAssertTrue(
            fn.contains("composerState.showOptions = false"),
            "`presentLongPressMenu` doit fermer le panneau d'options du composer s'il était ouvert."
        )
        guard let dismissRange = fn.range(of: "isTyping = false"),
              let presentRange = fn.range(of: "showOverlayMenu = true") else {
            return XCTFail("Ancres `isTyping = false` / `showOverlayMenu = true` introuvables.")
        }
        XCTAssertTrue(
            dismissRange.lowerBound < presentRange.lowerBound,
            "Le clavier doit se fermer AVANT que le menu ne se présente, jamais après."
        )
    }

    // MARK: - Repositionnement vers le centre si le message est trop bas

    func test_presentLongPressMenu_scrollsTowardCenter_whenMessageIsTooLow() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("guard let frame = cellFrame,"),
            "`presentLongPressMenu` doit lire la position réelle via le paramètre `cellFrame` (résolu côté "
                + "UIKit, `cellFrameInWindow`) — PAS `frameTracker`, qui n'est jamais alimenté en mode liste "
                + "standard (revue 2026-08-27)."
        )
        XCTAssertFalse(
            fn.contains("frameTracker.frame(for:"),
            "`presentLongPressMenu` ne doit PLUS lire `frameTracker` : `MessageFramePreferenceKey` ne "
                + "traverse la frontière UIKit qu'en mode Rivière (seul site qui la publie réellement) — "
                + "l'utiliser ici rendrait le repositionnement un NO-OP silencieux en mode liste standard."
        )
        XCTAssertTrue(
            fn.contains("scrollState.scrollToMessageId ="),
            "`presentLongPressMenu` doit déclencher un scroll via `scrollState.scrollToMessageId` — le même "
                + "mécanisme que le saut vers une citation ou un message non lu."
        )
        XCTAssertTrue(
            fn.contains("scrollState.scrollToMessageTrigger +="),
            "`presentLongPressMenu` doit incrémenter `scrollToMessageTrigger` pour déclencher le scroll."
        )
    }

    // MARK: - Le frame voyage AVEC l'appel, résolu côté UIKit (même patron qu'`onAddReaction`)

    func test_cellFrameInWindow_isTheSourceOfTruth_forTheStandardListMode() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let handler = body(of: "let longPressHandler: ((String) -> Void) = { [weak self] tappedId in", in: code) else {
            return XCTFail("Le wrapper `longPressHandler` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            handler.contains("self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))"),
            "Le wrapper `longPressHandler` doit résoudre le frame via `cellFrameInWindow` et le transmettre "
                + "AVEC l'id — même patron qu'`addReactionHandler`, la seule voie fiable en mode liste standard."
        )
    }

    func test_onLongPress_propertyType_carriesTheFrame() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("var onLongPress: ((String, CGRect?) -> Void)?"),
            "`MessageListViewController.onLongPress` doit porter le frame (`CGRect?`), pas seulement l'id."
        )
    }

    // MARK: - `scrollToItem` est bien CENTRÉ (pas top/bottom)

    func test_scrollToMessage_centersVertically() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let fn = body(of: "private func beginVerifiedScroll(", in: code) else {
            return XCTFail("`beginVerifiedScroll` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("at: .centeredVertically"),
            "Le scroll déclenché par le longpress doit centrer verticalement le message — sans ce "
                + "positionnement, remonter la liste ne garantit pas que le menu tienne entièrement à l'écran."
        )
    }

    // MARK: - Le site du longpress custom appelle le point d'entrée unique

    func test_customLongPressSite_callsPresentLongPressMenu() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("presentLongPressMenu(for: msg, cellFrame: cellFrame)"),
            "Le site du longpress custom doit appeler `presentLongPressMenu(for:cellFrame:)` avec le frame "
                + "reçu du callback — point d'entrée unique."
        )
    }

    // MARK: - L'état désactivé à l'ouverture est mémorisé ET restitué à la fermeture

    func test_presentLongPressMenu_savesStateBeforeDismissing() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        guard let saveRange = fn.range(of: "restoreAfterLongPress = (isTyping: isTyping, showOptions: composerState.showOptions)"),
              let dismissRange = fn.range(of: "isTyping = false") else {
            return XCTFail("Ancres de sauvegarde/désactivation introuvables.")
        }
        XCTAssertTrue(
            saveRange.lowerBound < dismissRange.lowerBound,
            "L'état doit être SAUVEGARDÉ avant d'être désactivé — sinon on mémorise déjà `false`."
        )
    }

    func test_restoreStateAfterLongPressIfNeeded_restoresSavedStateUnlessEditing() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func restoreStateAfterLongPressIfNeeded(", in: code) else {
            return XCTFail("`restoreStateAfterLongPressIfNeeded` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("isTyping = saved.isTyping"),
            "La restitution doit reposer `isTyping` sur la valeur sauvegardée AVANT le longpress."
        )
        XCTAssertTrue(
            fn.contains("composerState.editingMessageId != nil"),
            "La restitution doit être COURT-CIRCUITÉE si une édition vient de démarrer — sinon elle "
                + "écraserait le clavier que `beginEdit` veut ouvert."
        )
    }

    // MARK: - Retour porteur 2026-08-27 : « Sélectionner » rouvrait le clavier
    // (le composer, REMPLACÉ par `selectionToolbar`, n'a rien à restituer).

    func test_restoreStateAfterLongPressIfNeeded_skipsRestore_whenSelectionModeJustStarted() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func restoreStateAfterLongPressIfNeeded(", in: code) else {
            return XCTFail("`restoreStateAfterLongPressIfNeeded` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("guard !overlayState.isSelectionModeActive else { return }"),
            "Taper « Sélectionner » ferme le menu (`showOverlayMenu = false`) au MÊME dismiss que "
                + "`beginSelectionMode` — sans cette garde, la restitution rouvrirait le clavier sur un "
                + "composer que `selectionToolbar` a déjà remplacé."
        )
    }

    // MARK: - Le site de fermeture appelle la restitution via `adaptiveOnChange`, jamais `onChange` brut

    func test_dismissSite_wiresRestoration_viaAdaptiveOnChange() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains(".adaptiveOnChange(of: overlayState.showOverlayMenu)"),
            "La fermeture du menu doit être observée via `.adaptiveOnChange`, convention du dépôt "
                + "(`ConversationView.body` a déjà crashé de profondeur de pile par `.onChange` brut empilé)."
        )
        XCTAssertTrue(
            code.contains("restoreStateAfterLongPressIfNeeded()"),
            "Le site de fermeture doit appeler `restoreStateAfterLongPressIfNeeded()`."
        )
        XCTAssertFalse(
            code.contains(".onChange(of: overlayState.showOverlayMenu)"),
            "Un `.onChange` brut a remplacé `.adaptiveOnChange` — régression de la convention du dépôt."
        )
    }
}
