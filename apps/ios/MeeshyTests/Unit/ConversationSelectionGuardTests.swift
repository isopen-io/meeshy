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

    // MARK: - Retour porteur 2026-08-27 (#515) : une coche ne reconfigure QUE
    // sa propre rangée — `.allItems` sur `selectedMessageIds` allait à
    // l'encontre du gate `.equatable()` (#515), qui existe précisément pour
    // que les bulles IMMOBILES restent bon marché.

    func test_selectedMessageIds_reconfiguresOnlyTheChangedItems_notAllItems() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let block = body(of: "var selectedMessageIds: Set<String> = [] {", in: code) else {
            return XCTFail("`selectedMessageIds` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            block.contains("let changedIds = oldValue.symmetricDifference(selectedMessageIds)")
                && block.contains("applySnapshot(reconfigure: .items(changedLocalIds))"),
            "Une coche ne doit reconfigurer QUE les id dont l'état a changé (différence symétrique, "
                + "traduite serveur→local pour #4022) — `.allItems` reconfigurerait TOUTE rangée visible "
                + "pour un état qui ne change que sur UN message, défaisant le gate `.equatable()` (#515)."
        )
        XCTAssertFalse(
            block.contains(".allItems"),
            "`selectedMessageIds` ne doit plus poser `.allItems` — seul `isSelectionModeActive` "
                + "(bascule GLOBALE, affecte toute rangée) le justifie encore."
        )
    }

    func test_snapshotReconfigureScope_itemsCase_filtersToOnlyExistingTargets() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let fn = body(of: "case .items(let targetLocalIds):", in: code) else {
            return XCTFail("Le cas `.items` d'`applySnapshot` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("previousItems.contains(item) ? item : nil"),
            "Le reconfigure ciblé doit, comme `.allItems`, se filtrer aux items déjà PRÉSENTS dans le "
                + "snapshot appliqué — reconfigurer un id en cours d'INSERTION est non supporté "
                + "(commentaire voisin de `applySnapshot`)."
        )
    }

    // MARK: - Retour porteur 2026-08-27 (#4005 bis) : la bulle REÇUE se décale
    // pour loger le cercle de sélection CENTRÉ entre le bord et la bulle —
    // la bulle ENVOYÉE, elle, ne bouge pas (son cercle coïncide déjà avec
    // son propre coin, les deux ancrés à droite).

    func test_selectionShift_appliesToAllBubbles_regardlessOfIsMine() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        guard let prop = body(of: "private var selectionShift: CGFloat {", in: code) else {
            return XCTFail("`selectionShift` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            prop.contains("guard isSelectionModeActive else { return 0 }"),
            "Le décalage doit être nul hors sélection SEULEMENT — retour porteur 2026-08-27 ter : "
                + "« qu'importe le mode », la bulle ENVOYÉE se décale exactement comme la REÇUE."
        )
        XCTAssertFalse(
            prop.contains("!isMine"),
            "Aucune condition sur `isMine` ne doit subsister dans `selectionShift` — le décalage est "
                + "uniforme, plus de branchement par sens de bulle."
        )
    }

    func test_selectionShiftMultiplier_is3ForBubbleAnd2ForFlatRow() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        guard let prop = body(of: "private var selectionShiftMultiplier: CGFloat {", in: code) else {
            return XCTFail("`selectionShiftMultiplier` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            prop.contains("uniformFlatDirection ? 2 : 3"),
            "Retour porteur explicite : 3× le diamètre du cercle en mode bulle "
                + "(`uniformFlatDirection == false`), 2× en mode plat Focal/Script "
                + "(`uniformFlatDirection == true`)."
        )
    }

    func test_content_isPushedRightBy_selectionShift() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("content()\n                .padding(.leading, selectionShift)"),
            "`content()` doit être poussé à droite de `selectionShift` — c'est ce qui ouvre la "
                + "marge où loge le cercle d'une bulle reçue."
        )
    }

    // MARK: - #4022 : un `.items` reconfigure demandé PENDANT une décélération
    // ne doit plus être PERDU — il doit s'ACCUMULER (union) dans
    // `deferredReconfigureScope` au lieu d'être jeté avec le reste de
    // `itemsToReconfigure`. Sans ce correctif, une coche posée pendant que la
    // liste décélère incrémentait le compteur (source de vérité
    // `overlayState.selectedMessageIds`) sans jamais peindre visuellement la
    // sélection — le reconfigure ciblé s'évaporait à la pose du geste.

    func test_deferredReconfigure_accumulatesItemsScope_ratherThanDroppingIt() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        guard let fn = body(of: "private func applySnapshot(reconfigure: SnapshotReconfigureScope = .changedRecords) {", in: code) else {
            return XCTFail("`applySnapshot` introuvable — la garde ne mesurerait rien.")
        }
        guard let deferBlock = body(of: "if isDeferringReconfigure {", in: fn) else {
            return XCTFail("Branche de report introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            deferBlock.contains("case .items(let ids):") && deferBlock.contains(".union(ids)"),
            "Un `.items` demandé pendant un report doit s'ACCUMULER (union) dans `deferredReconfigureScope`, "
                + "jamais être jeté — sinon une coche posée en pleine décélération incrémente le compteur "
                + "sans jamais peindre visuellement la sélection (#4022)."
        )
        XCTAssertTrue(
            deferBlock.contains("case .allItems:") && deferBlock.contains("deferredReconfigureScope = .allItems"),
            "`.allItems` doit continuer de DOMINER (une bascule globale prime sur des ids ciblés)."
        )
    }

    func test_selectionCircle_alwaysTopLeading_regardlessOfIsMine() throws {
        let code = try source("Features/Main/Views/MessageListView.swift")
        XCTAssertTrue(
            code.contains(".overlay(alignment: .topLeading) {"),
            "Le cercle doit TOUJOURS se poser au coin haut-GAUCHE — retour porteur 2026-08-27 ter : "
                + "« qu'importe le mode », plus de branchement par `isMine`."
        )
        XCTAssertFalse(
            code.contains(".overlay(alignment: isMine ? .topTrailing : .topLeading) {"),
            "L'ancien branchement conditionnel par `isMine` ne doit plus exister."
        )
        guard let prop = body(of: "private var selectionLeadingCircleInset: CGFloat {", in: code) else {
            return XCTFail("`selectionLeadingCircleInset` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            prop.contains("(selectionShift - Self.selectionCircleDiameter) / 2"),
            "Le cercle doit être CENTRÉ dans la marge ouverte par `selectionShift` — ni collé au bord, "
                + "ni collé à la bulle."
        )
    }
}
