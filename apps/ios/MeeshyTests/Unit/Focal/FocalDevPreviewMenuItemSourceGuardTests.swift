import XCTest
@testable import Meeshy

/// I-075 — preuves par lecture de source de l'item « Focal (dev) » du menu
/// d'appui long de la liste (§0 workshop : re-preuve (a) — le menu HÉRITÉ de
/// `ConversationListView`, stable quand les drapeaux Lentille sont OFF, est
/// bien le groupe « plus d'options » des DEUX chemins par version d'OS :
/// `conversationContextMenu(for:)` (natif iOS 26, `ConversationListView+Overlays.swift`)
/// et `ConversationContextMenuView.morePanel` (fallback custom < iOS 26,
/// `ConversationContextMenuView.swift`)).
///
/// Ce fichier ne peut pas construire les vues (pas de toolchain Swift sous
/// Linux, R5) : il applique le patron `FocalHostSourceGuardTests`/
/// `ConversationViewReadingModeSourceGuardTests` — chaque assertion porte un
/// message d'échec écrit pour un lecteur qui ne voit que le run CI distant
/// (leçon 265 : une garde source doit être lisible sans reproduire le
/// contexte localement).
final class FocalDevPreviewMenuItemSourceGuardTests: XCTestCase {

    private func viewsRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ fileName: String) throws -> String {
        try String(contentsOf: viewsRoot().appendingPathComponent(fileName), encoding: .utf8)
    }

    // Ce fichier travaille SUR LA SOURCE BRUTE (jamais `AppSourceGuard
    // .stripComments`) : les bornes `// MARK: -` utilisées ci-dessous SONT
    // des commentaires — `stripComments` les effacerait, cassant la
    // localisation du builder natif (même piège documenté par
    // `FocalHostSourceGuardTests.test_r15_newComputationSections...`).
    // Aucune assertion de ce fichier n'est vulnérable à une fausse
    // correspondance dans un commentaire (les motifs cherchés — clés i18n,
    // signatures d'appel exactes — n'apparaissent dans aucun commentaire
    // voisin, vérifié à l'écriture de ces tests).

    // MARK: - Chemin natif (iOS 26+) — dans le groupe « Plus d'options »

    /// Garde d'ensemble (leçon 257) — EXACTEMENT une occurrence de la clé
    /// `context.focal_dev_preview` dans le builder natif : une garde de
    /// présence seule n'attraperait pas un second item dupliqué par erreur.
    func test_nativeMenu_offersFocalDevPreview_exactlyOnce_insideMoreOptionsGroup() throws {
        let code = try source("ConversationListView+Overlays.swift")

        guard let builderRange = code.range(of: "func conversationContextMenu(for") else {
            XCTFail("conversationContextMenu(for:) introuvable — le builder natif du menu long-press a-t-il été renommé ? (ConversationListView+Overlays.swift)")
            return
        }
        let overlayMarkRange = code.range(
            of: "// MARK: - Custom Context Menu Overlay",
            range: builderRange.lowerBound..<code.endIndex
        )
        let builderEnd = overlayMarkRange?.lowerBound ?? code.endIndex
        let builderBlock = String(code[builderRange.lowerBound..<builderEnd])

        let occurrences = builderBlock.components(separatedBy: "context.focal_dev_preview").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "conversationContextMenu(for:) doit offrir EXACTEMENT un item « Focal (dev) » (clé context.focal_dev_preview) — \(occurrences) trouvé(s). Zéro = l'item manque au menu natif (parité rompue avec le fallback custom) ; plus d'un = duplication."
        )

        guard let moreOptionsLabelRange = builderBlock.range(of: "String(localized: \"context.more_options\"") else {
            XCTFail("Le libellé « Plus d'options » (context.more_options) est introuvable dans le builder natif — le groupe cible d'I-075 a-t-il été renommé ?")
            return
        }
        guard let itemRange = builderBlock.range(of: "context.focal_dev_preview") else {
            XCTFail("context.focal_dev_preview introuvable dans le builder natif — voir l'assertion de comptage ci-dessus, qui doit déjà avoir échoué.")
            return
        }
        XCTAssertTrue(
            itemRange.upperBound < moreOptionsLabelRange.lowerBound,
            "L'item « Focal (dev) » doit vivre AVANT le `label:` de « Plus d'options » — c'est-à-dire À L'INTÉRIEUR du `Menu { … } label: { … Plus d'options … }` (design imposé §0 workshop : l'item va dans le groupe « plus d'options » du menu hérité, stable)."
        )
    }

    /// L'item est gardé par le TROISIÈME drapeau (`focalDevPreview`), jamais
    /// par `readingModes`/`lentilleList` — sinon il apparaîtrait aussi en
    /// prod dès que `reading_modes` (ou `lentille_list`) s'allume pour une
    /// raison sans rapport.
    func test_nativeMenu_focalDevPreviewItem_isGuardedByItsOwnFlag() throws {
        let code = try source("ConversationListView+Overlays.swift")
        guard let itemRange = code.range(of: "context.focal_dev_preview") else {
            XCTFail("context.focal_dev_preview introuvable dans ConversationListView+Overlays.swift.")
            return
        }
        guard let guardRange = code.range(
            of: "if LentilleFeatureFlag.isFocalDevPreviewEnabled {",
            range: code.startIndex..<itemRange.lowerBound
        ) else {
            XCTFail("`if LentilleFeatureFlag.isFocalDevPreviewEnabled {` introuvable AVANT context.focal_dev_preview — l'item doit être gardé par SON PROPRE drapeau, séparé de reading_modes/lentille_list (design imposé §0 workshop point 2).")
            return
        }
        // Aucun AUTRE `if LentilleFeatureFlag.` ne doit se glisser entre la
        // garde et l'item (sinon la garde trouvée n'est pas celle qui couvre
        // réellement le Button).
        let between = code[guardRange.upperBound..<itemRange.lowerBound]
        XCTAssertFalse(
            between.contains("if LentilleFeatureFlag."),
            "Une seconde garde `if LentilleFeatureFlag.` se glisse entre `isFocalDevPreviewEnabled` et l'item « Focal (dev) » — la garde effective n'est peut-être pas celle attendue."
        )
    }

    /// Garde « aucune écriture » (action model) — la fenêtre de l'action du
    /// Button ne doit contenir NI `setForDebug` (drapeau) NI `.select(`
    /// (préférence collante `ReadingModeController`) NI `UserDefaults`.
    func test_nativeMenu_focalDevPreviewAction_writesNoFlagAndNoPreference() throws {
        let code = try source("ConversationListView+Overlays.swift")
        guard let guardRange = code.range(of: "if LentilleFeatureFlag.isFocalDevPreviewEnabled {") else {
            XCTFail("Garde du menu natif introuvable — voir test_nativeMenu_focalDevPreviewItem_isGuardedByItsOwnFlag.")
            return
        }
        let windowEnd = code.index(guardRange.upperBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
        let actionWindow = code[guardRange.upperBound..<windowEnd]

        XCTAssertTrue(
            actionWindow.contains("router.pendingForcedReadingMode = .focal"),
            "L'action doit poser `router.pendingForcedReadingMode = .focal` — le canal ÉPHÉMÈRE, jamais une écriture de préférence."
        )
        XCTAssertFalse(
            actionWindow.contains("setForDebug"),
            "L'action de l'item « Focal (dev) » ne doit JAMAIS appeler LentilleFeatureFlag.setForDebug — override éphémère, pas une bascule de réglage persistante."
        )
        XCTAssertFalse(
            actionWindow.contains(".select("),
            "L'action de l'item « Focal (dev) » ne doit JAMAIS appeler ReadingModeController.select(...) — cela écrirait la préférence collante (store), violant « jamais persistant »."
        )
        XCTAssertFalse(
            actionWindow.contains("UserDefaults"),
            "L'action de l'item « Focal (dev) » ne doit JAMAIS toucher UserDefaults directement."
        )
    }

    // MARK: - Chemin custom (< iOS 26 fallback) — parité

    func test_customMenuOverlay_morePanel_offersFocalDevPreview_exactlyOnce() throws {
        let code = try source("ConversationContextMenuView.swift")
        let occurrences = code.components(separatedBy: "context.focal_dev_preview").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "ConversationContextMenuView doit offrir EXACTEMENT un item « Focal (dev) » (clé context.focal_dev_preview) dans morePanel — \(occurrences) trouvé(s). Zéro = parité rompue avec le menu natif (iOS < 26 perdrait l'item)."
        )

        guard let morePanelRange = code.range(of: "private var morePanel: some View {") else {
            XCTFail("morePanel introuvable dans ConversationContextMenuView.swift — le panneau « Plus d'options » du fallback custom a-t-il été renommé ?")
            return
        }
        guard let itemRange = code.range(of: "context.focal_dev_preview", range: morePanelRange.lowerBound..<code.endIndex) else {
            XCTFail("context.focal_dev_preview n'est pas DANS morePanel — l'item doit vivre dans le panneau « Plus d'options », pas ailleurs (rootPanel/favoritePanel/movePanel).")
            return
        }
        _ = itemRange
    }

    func test_customMenuOverlay_focalDevPreviewRow_isGuardedByItsOwnFlag() throws {
        let code = try source("ConversationContextMenuView.swift")
        guard let itemRange = code.range(of: "context.focal_dev_preview") else {
            XCTFail("context.focal_dev_preview introuvable dans ConversationContextMenuView.swift.")
            return
        }
        guard let guardRange = code.range(
            of: "if isFocalDevPreviewEnabled {",
            range: code.startIndex..<itemRange.lowerBound
        ) else {
            XCTFail("`if isFocalDevPreviewEnabled {` introuvable AVANT context.focal_dev_preview dans ConversationContextMenuView.swift — la row doit être gardée (le param `isFocalDevPreviewEnabled` résolu par l'appelant, la vue restant self-contained).")
            return
        }
        _ = guardRange
    }

    /// La row appelle `onOpenFocalDevPreview()` puis `onDismiss()` — même
    /// patron que la row Supprimer (`{ onDelete(); onDismiss() }`) : l'action
    /// ET la fermeture du menu, jamais l'une sans l'autre.
    func test_customMenuOverlay_focalDevPreviewRow_callsCallbackThenDismiss() throws {
        let code = try source("ConversationContextMenuView.swift")
        XCTAssertTrue(
            code.contains("{ onOpenFocalDevPreview(); onDismiss() }"),
            "La row « Focal (dev) » de morePanel doit appeler `{ onOpenFocalDevPreview(); onDismiss() }` — l'action puis la fermeture du menu, comme toutes les autres rows (ex. Supprimer)."
        )
    }

    /// L'appelant (`ConversationListView+Overlays.swift`) résout le drapeau
    /// et câble le callback réel — même garde « aucune écriture » que le
    /// chemin natif.
    func test_customMenuOverlayCallSite_wiresFlagAndWritesNoPreference() throws {
        let code = try source("ConversationListView+Overlays.swift")
        XCTAssertTrue(
            code.contains("isFocalDevPreviewEnabled: LentilleFeatureFlag.isFocalDevPreviewEnabled"),
            "Le site d'instanciation de ConversationContextMenuView doit passer isFocalDevPreviewEnabled: LentilleFeatureFlag.isFocalDevPreviewEnabled — sinon le fallback custom resterait aveugle au drapeau (toujours cachée ou toujours visible)."
        )
        guard let callbackRange = code.range(of: "onOpenFocalDevPreview: {") else {
            XCTFail("Le callback onOpenFocalDevPreview: n'est pas câblé au site d'instanciation de ConversationContextMenuView.")
            return
        }
        let windowEnd = code.index(callbackRange.upperBound, offsetBy: 350, limitedBy: code.endIndex) ?? code.endIndex
        let window = code[callbackRange.upperBound..<windowEnd]
        XCTAssertTrue(
            window.contains("router.pendingForcedReadingMode = .focal") && window.contains("onSelect(conversation)"),
            "onOpenFocalDevPreview doit poser router.pendingForcedReadingMode = .focal PUIS appeler onSelect(conversation) — même chemin que le menu natif (SSOT navigation)."
        )
        XCTAssertFalse(
            window.contains("setForDebug") || window.contains(".select(") || window.contains("UserDefaults"),
            "onOpenFocalDevPreview ne doit écrire NI drapeau NI préférence — override éphémère (même garde que le chemin natif)."
        )
    }
}
