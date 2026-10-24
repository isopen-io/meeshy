import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Tests du helper pur de chaîne de langues du viewer avec override "explore other languages".
/// Le Prisme Linguistique affiche par défaut la langue préférée (`preferredContentLanguages`),
/// mais l'utilisateur peut explorer une autre langue via le picker — l'override est alors
/// PRÉPENDU à la chaîne (priorité la plus haute), sans jamais supprimer les préférences de base.
@MainActor
final class StoryViewerLanguageOverrideTests: XCTestCase {

    func test_viewerLanguageChain_nilOverride_returnsBaseUnchanged() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: nil), ["fr", "en"])
    }

    func test_viewerLanguageChain_emptyOverride_returnsBaseUnchanged() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: ""), ["fr", "en"])
    }

    func test_viewerLanguageChain_newOverride_prependsToChain() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "es"), ["es", "fr", "en"])
    }

    func test_viewerLanguageChain_overrideAlreadyFirst_noDuplicate() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "fr"), ["fr", "en"])
    }

    func test_viewerLanguageChain_overrideInMiddle_movedToFrontDeduplicated() {
        let base = ["fr", "en", "de"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "de"), ["de", "fr", "en"])
    }

    func test_viewerLanguageChain_emptyBase_returnsOverrideOnly() {
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: [], override: "ja"), ["ja"])
    }

    // MARK: - « Original » — une story est multilingue par nature
    //
    // Directive user 2026-07-27 : plusieurs bouts d'une même story peuvent être
    // écrits dans des langues DIFFÉRENTES, et il faut pouvoir revenir à
    // l'original quoi qu'il arrive. Choisir la langue d'origine de la story ne
    // suffit pas : un overlay rédigé en français dans une story marquée `en`
    // possède une traduction `en`, qui serait servie à la place de son texte
    // réel. Aligner tous les bouts sur une seule langue EFFACE les autres.
    //
    // `StoryTextObject.resolvedText` rend déjà le texte source quand la chaîne
    // est vide. « Original » est donc une chaîne VIDE, pas un code langue —
    // chaque overlay retombe alors sur son propre texte, dans sa propre langue.

    func test_viewerLanguageChain_originalOverride_emptiesTheChain() {
        let base = ["fr", "en"]
        XCTAssertEqual(
            StoryViewerView.viewerLanguageChain(base: base, override: StoryViewerView.originalLanguageOverride),
            []
        )
    }

    func test_viewerLanguageChain_originalOverride_emptyBase_stillEmpty() {
        XCTAssertEqual(
            StoryViewerView.viewerLanguageChain(base: [], override: StoryViewerView.originalLanguageOverride),
            []
        )
    }

    func test_originalLanguageOverride_isNotAValidLanguageCode() {
        // La sentinelle ne doit jamais pouvoir entrer en collision avec un code
        // BCP-47 réel, sinon elle serait résolue comme une langue traduisible.
        let sentinel = StoryViewerView.originalLanguageOverride
        XCTAssertFalse(sentinel.isEmpty)
        XCTAssertNil(sentinel.range(of: "^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]+)*$", options: .regularExpression))
    }
}

/// **Le bouton « Traductions » de la story se rechoisit autant qu'on veut, et
/// sa liste défile** (#12646, porteur 2026-10-24).
///
/// Avant : rien ne remettait l'exploration à `nil` — un premier choix figeait
/// la story jusqu'à la slide suivante ; la liste complète ne défilait pas (le
/// glissé de la feuille, posé sur tout le panneau, volait celui de la liste) ;
/// la barre rapide défilante changeait de groupe ; les langues du son n'y
/// entraient pas.
@MainActor
final class StoryLanguageReselectTests: XCTestCase {

    // MARK: - La puce active relâche le choix

    func test_tappingTheChosenLanguage_returnsToTheReadersPrism() {
        XCTAssertNil(StoryLanguageQuickBar.override(afterTapping: "es", current: "es"))
        XCTAssertNil(StoryLanguageQuickBar.override(afterTapping: "pt", current: "pt-BR"),
                     "Même langue de base : c'est la puce active.")
    }

    func test_tappingAnotherLanguage_choosesIt_atAnyTime() {
        XCTAssertEqual(StoryLanguageQuickBar.override(afterTapping: "en", current: "es"), "en")
        XCTAssertEqual(StoryLanguageQuickBar.override(afterTapping: "en", current: nil), "en")
    }

    func test_afterOriginal_aLanguageTap_choosesTheLanguage() {
        let original = StoryReaderContentRules.originalLanguageOverride
        XCTAssertEqual(StoryLanguageQuickBar.override(afterTapping: "fr", current: original), "fr")
    }

    // MARK: - Les langues du son entrent au rail et au menu

    func test_aSpokenOnlyStory_offersItsTranscriptLanguages_onTheRail() {
        let story = makeStory(transcripts: [
            StoryVoiceTranscription(language: "fr", content: "Bonjour"),
            StoryVoiceTranscription(language: "en-US", content: "Hello"),
        ])
        let codes = StoryReaderContentRules.availableTranslationLanguages(of: story).map(\.id)
        XCTAssertTrue(codes.contains("fr"))
        XCTAssertTrue(codes.contains("en"), "« en-US » sert « en ».")
    }

    func test_theTranscriptSubmenu_listsOnlyReadableTranscripts() {
        let effects = StoryEffects(voiceTranscriptions: [
            StoryVoiceTranscription(language: "fr", content: "Bonjour"),
            StoryVoiceTranscription(language: "es", content: "   "),
        ])
        XCTAssertEqual(StoryReaderContentRules.transcriptLanguages(effects: effects).map(\.id), ["fr"])
        XCTAssertTrue(StoryReaderContentRules.transcriptLanguages(effects: nil).isEmpty)
    }

    // MARK: - Ce qui défile défile

    /// Seule la poignée tire la feuille des langues : posé sur tout le panneau,
    /// le glissé capturait celui de la liste.
    func test_theFullLanguageList_scrolls_onlyTheHandleDragsTheSheet() throws {
        let detail = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryLanguageDetailView.swift"))
        XCTAssertEqual(detail.components(separatedBy: ".gesture(sheetDragGesture)").count - 1, 1)
        let handle = try XCTUnwrap(detail.range(of: "handle\n"))
        let afterHandle = detail[handle.upperBound...].prefix(160)
        XCTAssertTrue(afterHandle.contains(".gesture(sheetDragGesture)"), "Le glissé de la feuille vit sur la poignée.")
    }

    /// La barre rapide défilante revendique son glissé horizontal comme la
    /// barre de réactions — sinon le lecteur change de groupe.
    func test_theQuickBar_claimsItsHorizontalDrag() throws {
        let rail = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"))
        let bar = try XCTUnwrap(rail.range(of: "StoryLanguageQuickBar("))
        XCTAssertTrue(rail[bar.upperBound...].prefix(1800).contains(".simultaneousGesture(reactionStripDragGesture)"))
        XCTAssertTrue(rail.contains("StoryLanguageQuickBar.override(afterTapping: lang, current: activeLanguageCode)"))
    }

    // MARK: - Fabriques

    private func makeStory(transcripts: [StoryVoiceTranscription]) -> StoryItem {
        StoryItem(id: "s1", content: nil,
                  storyEffects: StoryEffects(voiceTranscriptions: transcripts),
                  createdAt: Date(), expiresAt: Date().addingTimeInterval(3600))
    }
}
