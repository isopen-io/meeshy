import XCTest
@testable import Meeshy

/// I-075 (amendement produit 2026-08-16) — preuves par lecture de source de
/// l'item « Focal (bêta) » du menu d'appui long de la liste (§0 workshop :
/// re-preuve (a) — le menu HÉRITÉ de `ConversationListView`, stable, est bien
/// le groupe « plus d'options » des DEUX chemins par version d'OS :
/// `conversationContextMenu(for:)` (natif iOS 26, `ConversationListView+Overlays.swift`)
/// et `ConversationContextMenuView.morePanel` (fallback custom < iOS 26,
/// `ConversationContextMenuView.swift`)).
///
/// Ce lot remplace le drapeau caché `LentilleFeatureFlag.focalDevPreview`
/// (dev-only) par `BetaFeaturesPreference.isEnabled` (préférence utilisateur
/// « Activer les bêta », défaut ON) — la publication devient bêta PUBLIQUE :
/// même item, même override éphémère à l'ouverture, garde différente.
///
/// Ce fichier ne peut pas construire les vues (pas de toolchain Swift sous
/// Linux, R5) : il applique le patron `FocalHostSourceGuardTests`/
/// `ConversationViewReadingModeSourceGuardTests` — chaque assertion porte un
/// message d'échec écrit pour un lecteur qui ne voit que le run CI distant
/// (leçon 265 : une garde source doit être lisible sans reproduire le
/// contexte localement).
final class FocalBetaPreviewMenuItemSourceGuardTests: XCTestCase {

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
    /// `context.focal_beta_preview` dans le builder natif : une garde de
    /// présence seule n'attraperait pas un second item dupliqué par erreur.
    func test_nativeMenu_offersFocalBetaPreview_exactlyOnce_insideMoreOptionsGroup() throws {
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

        let occurrences = builderBlock.components(separatedBy: "context.focal_beta_preview").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "conversationContextMenu(for:) doit offrir EXACTEMENT un item « Focal (bêta) » (clé context.focal_beta_preview) — \(occurrences) trouvé(s). Zéro = l'item manque au menu natif (parité rompue avec le fallback custom) ; plus d'un = duplication."
        )

        guard let moreOptionsLabelRange = builderBlock.range(of: "String(localized: \"context.more_options\"") else {
            XCTFail("Le libellé « Plus d'options » (context.more_options) est introuvable dans le builder natif — le groupe cible d'I-075 a-t-il été renommé ?")
            return
        }
        guard let itemRange = builderBlock.range(of: "context.focal_beta_preview") else {
            XCTFail("context.focal_beta_preview introuvable dans le builder natif — voir l'assertion de comptage ci-dessus, qui doit déjà avoir échoué.")
            return
        }
        XCTAssertTrue(
            itemRange.upperBound < moreOptionsLabelRange.lowerBound,
            "L'item « Focal (bêta) » doit vivre AVANT le `label:` de « Plus d'options » — c'est-à-dire À L'INTÉRIEUR du `Menu { … } label: { … Plus d'options … }` (design imposé §0 workshop : l'item va dans le groupe « plus d'options » du menu hérité, stable)."
        )
    }

    /// L'item est gardé par la PRÉFÉRENCE bêta, jamais par
    /// `reading_modes`/`lentille_list` — sinon il apparaîtrait/disparaîtrait
    /// selon un réglage sans rapport.
    func test_nativeMenu_focalBetaPreviewItem_isGuardedByBetaFeaturesPreference() throws {
        let code = try source("ConversationListView+Overlays.swift")
        guard let itemRange = code.range(of: "context.focal_beta_preview") else {
            XCTFail("context.focal_beta_preview introuvable dans ConversationListView+Overlays.swift.")
            return
        }
        guard let guardRange = code.range(
            of: "if BetaFeaturesPreference.isEnabled {",
            range: code.startIndex..<itemRange.lowerBound
        ) else {
            XCTFail("`if BetaFeaturesPreference.isEnabled {` introuvable AVANT context.focal_beta_preview — l'item doit être gardé par la préférence bêta, séparée de reading_modes/lentille_list (amendement produit 2026-08-16).")
            return
        }
        // Aucun `if LentilleFeatureFlag.` (l'ancien mécanisme) ne doit
        // subsister entre la garde et l'item.
        let between = code[guardRange.upperBound..<itemRange.lowerBound]
        XCTAssertFalse(
            between.contains("if LentilleFeatureFlag."),
            "Une garde `if LentilleFeatureFlag.` (l'ANCIEN mécanisme, remplacé) se glisse entre `BetaFeaturesPreference.isEnabled` et l'item « Focal (bêta) »."
        )
    }

    /// Garde « aucune écriture » (action model) — la fenêtre de l'action du
    /// Button ne doit contenir NI `setForDebug`/`BetaFeaturesPreference
    /// .setEnabled` NI `.select(` (préférence collante `ReadingModeController`)
    /// NI `UserDefaults`. La préférence bêta elle-même est un réglage de
    /// plein droit (écrite par `SettingsView`), mais l'ACTION du menu ne doit
    /// ni la lire-écrire ni toucher au mode de lecture persistant.
    func test_nativeMenu_focalBetaPreviewAction_writesNoPreferenceAtAll() throws {
        let code = try source("ConversationListView+Overlays.swift")
        guard let guardRange = code.range(of: "if BetaFeaturesPreference.isEnabled {") else {
            XCTFail("Garde du menu natif introuvable — voir test_nativeMenu_focalBetaPreviewItem_isGuardedByBetaFeaturesPreference.")
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
            "L'action de l'item « Focal (bêta) » ne doit JAMAIS appeler LentilleFeatureFlag.setForDebug — override éphémère, pas une bascule de réglage persistante."
        )
        XCTAssertFalse(
            actionWindow.contains("BetaFeaturesPreference.setEnabled"),
            "L'action de l'item « Focal (bêta) » ne doit JAMAIS appeler BetaFeaturesPreference.setEnabled — ouvrir Focal en bêta ne doit pas, en retour, modifier le réglage qui l'a rendu visible."
        )
        XCTAssertFalse(
            actionWindow.contains(".select("),
            "L'action de l'item « Focal (bêta) » ne doit JAMAIS appeler ReadingModeController.select(...) — cela écrirait la préférence collante (store), violant « jamais persistant »."
        )
        XCTAssertFalse(
            actionWindow.contains("UserDefaults"),
            "L'action de l'item « Focal (bêta) » ne doit JAMAIS toucher UserDefaults directement."
        )
    }

    // MARK: - Chemin custom (< iOS 26 fallback) — parité

    func test_customMenuOverlay_morePanel_offersFocalBetaPreview_exactlyOnce() throws {
        let code = try source("ConversationContextMenuView.swift")
        let occurrences = code.components(separatedBy: "context.focal_beta_preview").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "ConversationContextMenuView doit offrir EXACTEMENT un item « Focal (bêta) » (clé context.focal_beta_preview) dans morePanel — \(occurrences) trouvé(s). Zéro = parité rompue avec le menu natif (iOS < 26 perdrait l'item)."
        )

        guard let morePanelRange = code.range(of: "private var morePanel: some View {") else {
            XCTFail("morePanel introuvable dans ConversationContextMenuView.swift — le panneau « Plus d'options » du fallback custom a-t-il été renommé ?")
            return
        }
        guard let itemRange = code.range(of: "context.focal_beta_preview", range: morePanelRange.lowerBound..<code.endIndex) else {
            XCTFail("context.focal_beta_preview n'est pas DANS morePanel — l'item doit vivre dans le panneau « Plus d'options », pas ailleurs (rootPanel/favoritePanel/movePanel).")
            return
        }
        _ = itemRange
    }

    func test_customMenuOverlay_focalBetaPreviewRow_isGuardedByItsOwnProperty() throws {
        let code = try source("ConversationContextMenuView.swift")
        guard let itemRange = code.range(of: "context.focal_beta_preview") else {
            XCTFail("context.focal_beta_preview introuvable dans ConversationContextMenuView.swift.")
            return
        }
        guard let guardRange = code.range(
            of: "if isFocalBetaPreviewEnabled {",
            range: code.startIndex..<itemRange.lowerBound
        ) else {
            XCTFail("`if isFocalBetaPreviewEnabled {` introuvable AVANT context.focal_beta_preview dans ConversationContextMenuView.swift — la row doit être gardée (le param `isFocalBetaPreviewEnabled` résolu par l'appelant, la vue restant self-contained).")
            return
        }
        _ = guardRange
    }

    /// La row appelle `onOpenFocalBetaPreview()` puis `onDismiss()` — même
    /// patron que la row Supprimer (`{ onDelete(); onDismiss() }`) : l'action
    /// ET la fermeture du menu, jamais l'une sans l'autre.
    func test_customMenuOverlay_focalBetaPreviewRow_callsCallbackThenDismiss() throws {
        let code = try source("ConversationContextMenuView.swift")
        XCTAssertTrue(
            code.contains("{ onOpenFocalBetaPreview(); onDismiss() }"),
            "La row « Focal (bêta) » de morePanel doit appeler `{ onOpenFocalBetaPreview(); onDismiss() }` — l'action puis la fermeture du menu, comme toutes les autres rows (ex. Supprimer)."
        )
    }

    /// L'appelant (`ConversationListView+Overlays.swift`) résout la
    /// préférence et câble le callback réel — même garde « aucune écriture »
    /// que le chemin natif.
    func test_customMenuOverlayCallSite_wiresBetaPreferenceAndWritesNothing() throws {
        let code = try source("ConversationListView+Overlays.swift")
        XCTAssertTrue(
            code.contains("isFocalBetaPreviewEnabled: BetaFeaturesPreference.isEnabled"),
            "Le site d'instanciation de ConversationContextMenuView doit passer isFocalBetaPreviewEnabled: BetaFeaturesPreference.isEnabled — sinon le fallback custom resterait aveugle à la préférence (toujours cachée ou toujours visible)."
        )
        guard let callbackRange = code.range(of: "onOpenFocalBetaPreview: {") else {
            XCTFail("Le callback onOpenFocalBetaPreview: n'est pas câblé au site d'instanciation de ConversationContextMenuView.")
            return
        }
        let windowEnd = code.index(callbackRange.upperBound, offsetBy: 350, limitedBy: code.endIndex) ?? code.endIndex
        let window = code[callbackRange.upperBound..<windowEnd]
        XCTAssertTrue(
            window.contains("router.pendingForcedReadingMode = .focal") && window.contains("onSelect(conversation)"),
            "onOpenFocalBetaPreview doit poser router.pendingForcedReadingMode = .focal PUIS appeler onSelect(conversation) — même chemin que le menu natif (SSOT navigation)."
        )
        XCTAssertFalse(
            window.contains("setForDebug") || window.contains("BetaFeaturesPreference.setEnabled") || window.contains(".select(") || window.contains("UserDefaults"),
            "onOpenFocalBetaPreview ne doit écrire NI drapeau NI préférence (mode OU bêta) — override éphémère (même garde que le chemin natif)."
        )
    }
}
