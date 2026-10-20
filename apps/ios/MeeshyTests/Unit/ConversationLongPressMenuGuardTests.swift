import XCTest
@testable import Meeshy

/// **#4004 — le menu longpress custom ferme le clavier avant de paraître.**
/// **#11208 — il s'ouvre sur la cellule elle-même, à sa place, sans défilement
/// préalable, avec une seule haptique.** Le recentrage d'un message trop bas
/// (#4004) passait par un défilement de la liste puis un délai : la loi de
/// placement de l'overlay (`MessageOverlayRevealLaw`) remonte désormais le
/// cluster, et la liste ne bouge plus sous le doigt.
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
            try AppSourceGuard.text(at: root.appendingPathComponent(relativePath))
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

    // MARK: - #11208 — le cadre de la cellule est GARDÉ, l'aperçu s'ouvre à sa place

    /// Le cadre que l'appel apporte (`cellFrameInWindow`) devient la source de
    /// l'aperçu. Il était reçu puis jeté : l'overlay lisait `frameTracker`, vide
    /// hors des bulles suivies, et retombait sur un aperçu reconstruit.
    func test_presentLongPressMenu_storesTheCellFrame_asTheOverlaySource() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("overlayState.overlaySourceFrame = "),
            "`presentLongPressMenu` doit garder le cadre reçu de `cellFrameInWindow` dans `overlaySourceFrame`."
        )
        XCTAssertFalse(
            fn.contains("frameTracker.frame(for:"),
            "`presentLongPressMenu` ne lit pas `frameTracker` : `MessageFramePreferenceKey` ne traverse la "
                + "frontière UIKit qu'en mode Rivière (seul site qui la publie réellement)."
        )
        guard let storeRange = fn.range(of: "overlayState.overlaySourceFrame = "),
              let presentRange = fn.range(of: "showOverlayMenu = true") else {
            return XCTFail("Ancres `overlaySourceFrame` / `showOverlayMenu = true` introuvables.")
        }
        XCTAssertTrue(storeRange.lowerBound < presentRange.lowerBound,
                      "Le cadre est posé AVANT la présentation : le premier rendu de l'aperçu le lit.")
    }

    func test_overlayState_declaresTheSourceFrame() throws {
        let code = try source("Features/Main/Views/ConversationOverlayState.swift")
        XCTAssertTrue(code.contains("var overlaySourceFrame: CGRect? = nil"),
                      "`ConversationOverlayState` porte le cadre source de l'aperçu, `nil` hors appui long.")
    }

    func test_overlayLayer_readsTheStoredFrameBeforeTheTracker() throws {
        let code = try source("Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        XCTAssertTrue(
            code.contains("bubbleFrame: overlayState.overlaySourceFrame ?? frameTracker.frame(for: msg.id) ?? .zero"),
            "L'overlay lit d'abord le cadre gardé, puis le suivi des bulles (Rivière), puis rien."
        )
    }

    /// Plus de défilement préalable ni de présentation différée : la loi de
    /// placement de l'overlay remonte le cluster, la liste ne bouge pas sous le
    /// doigt et le menu paraît dans la même image que le geste.
    func test_presentLongPressMenu_presentsAtOnce_withoutScrollingFirst() throws {
        let code = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let fn = body(of: "func presentLongPressMenu(", in: code) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(fn.contains("asyncAfter"), "La présentation n'attend plus un défilement.")
        XCTAssertFalse(fn.contains("scrollToMessageTrigger"), "L'appui long ne fait plus défiler la liste.")
        XCTAssertFalse(code.contains("longPressRepositionDelay"), "Le délai de repositionnement n'a plus de raison d'être.")
    }

    // MARK: - #11208 — une seule haptique, celle du geste

    func test_openingChain_firesASingleHaptic_theGesturesOwn() throws {
        let list = try source("Features/Main/Views/MessageListView.swift")
        guard let gesture = body(of: "private struct ConditionalBubbleLongPress", in: list) else {
            return XCTFail("`ConditionalBubbleLongPress` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertEqual(gesture.components(separatedBy: "HapticFeedback.").count - 1, 1,
                       "Le geste porte l'unique haptique de l'ouverture.")

        let host = try source("Features/Main/Views/ConversationView+LongPressMenu.swift")
        guard let present = body(of: "func presentLongPressMenu(", in: host) else {
            return XCTFail("`presentLongPressMenu` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(present.contains("HapticFeedback."), "La présentation ne vibre pas une seconde fois.")

        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let entrance = body(of: "private func enter()", in: menu) else {
            return XCTFail("L'entrée de l'overlay (`enter()`) introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(entrance.contains("HapticFeedback."), "L'entrée de l'overlay ne vibre pas : le geste l'a déjà fait.")
        XCTAssertTrue(menu.contains(".onAppear { enter() }"), "L'overlay entre par `enter()`, et seulement par elle.")
    }

    // MARK: - #11208 — « Réduire les animations » est lu à l'entrée

    func test_entrance_readsReduceMotion_andFadesInsteadOfSpringing() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains("@Environment(\\.accessibilityReduceMotion)"),
                      "L'overlay lit « Réduire les animations ».")
        guard let entrance = body(of: "private func enter()", in: menu) else {
            return XCTFail("L'entrée de l'overlay (`enter()`) introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(entrance.contains("reduceMotion"), "L'entrée choisit sa courbe selon « Réduire les animations ».")
        XCTAssertTrue(entrance.contains(".easeOut(duration: Self.reducedMotionFadeDuration)"),
                      "Sous « Réduire les animations », l'entrée est un fondu.")
    }

    // MARK: - #11208 — l'aperçu est la cellule, plus une bulle reconstruite

    func test_legacyRebuiltPreview_isGone() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        for removed in ["previewTextBubble", "previewFileRow", "clearPreviewContent", "func messagePreview("] {
            XCTAssertFalse(menu.contains(removed), "`\(removed)` reconstruisait une bulle générique — il ne revient pas.")
        }
        XCTAssertTrue(menu.contains("MessageOverlayCellPreview("), "L'aperçu monte la cellule du fil.")
    }

    func test_preview_wearsTheThreadSkin() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        guard let range = menu.range(of: "MessageOverlayCellPreview(") else {
            return XCTFail("`MessageOverlayCellPreview(` introuvable — la garde ne mesurerait rien.")
        }
        let mount = String(menu[range.lowerBound...].prefix(600))
        XCTAssertTrue(mount.contains(".environment(\\.bubbleSkin, previewSkin)"),
                      "La peau du fil est posée sur l'aperçu, quelle que soit sa face.")
    }

    func test_preview_isChosenByTheReadingModeLaw() throws {
        let menu = try source("Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains("MessageOverlayPreviewKind.resolve(readingMode: threadLanguage.readingMode)"),
                      "La face de l'aperçu se lit au mode de lecture du fil, par la loi pure.")
        let cell = try source("Features/Main/Components/MessageOverlayCellPreview.swift")
        XCTAssertTrue(cell.contains("FocalRow(input:"), "La face rangée plate rend la `FocalRow` du fil.")
        XCTAssertTrue(cell.contains("ThemedMessageBubble"), "La face bulle rend la `ThemedMessageBubble` du fil.")
        XCTAssertTrue(cell.contains("OverlayProtectedPreview("), "La protection reste en amont des deux faces.")
    }

    /// Le voile ne floute plus le fond à 12 : un flou léger, d'au plus 8, sous
    /// l'assombrissement de l'overlay (#11222 en fixe la loi commune).
    func test_backdropBlur_isAtMostEight() throws {
        let code = try source("Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        XCTAssertFalse(code.contains("showOverlayMenu ? 12 : 0"), "Le flou plein écran de 12 est retiré.")
        XCTAssertTrue(code.contains(".blur(radius: overlayState.showOverlayMenu ? ConversationOverlayBackdrop.blurRadius : 0)"))
        XCTAssertLessThanOrEqual(ConversationOverlayBackdrop.blurRadius, 8)
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
        guard let fn = body(of: "func beginVerifiedScroll(", in: code) else {
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
        let host = try source("Features/Main/Views/ConversationView.swift")
        let list = try source("Features/Main/Views/ConversationView+MessageListLayer.swift")
        XCTAssertTrue(
            list.contains("actions.presentMenu(msg, cellFrame, nil)")
                && host.contains("presentMenu: { presentLongPressMenu(for: $0, cellFrame: $1, pieceId: $2) }"),
            "Le site du longpress custom (la couche de la liste) doit appeler `presentLongPressMenu(for:cellFrame:)` "
                + "de l'hôte avec le frame reçu du callback — point d'entrée unique."
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
