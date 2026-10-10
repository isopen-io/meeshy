import XCTest
@testable import Meeshy

/// **Le menu « … » de la story, revu par le porteur (#9953, 2026-10-10).**
///
/// Le même menu pour TOUT lecteur, sa story ou celle d'un autre :
/// Plein écran · Transcription (si présente) · Composer · Partager ▸
/// (Exporter en vidéo, Partager à un ami) · Signaler / Supprimer · Fermer.
///
/// Envoyer, Republier en post, Citer en post, Enregistrer et Enregistrer le(s)
/// sticker(s) quittent le menu. « Enregistrer » (#8823) vit désormais dans la
/// feuille du système de « Partager à un ami » (« Enregistrer la vidéo »), et
/// dans la feuille d'export. Le (X) de l'en-tête est retiré : le glissement
/// vers le bas ferme, « Fermer » est la dernière entrée.
enum StoryOptionsMenuPlanFixture {
    static func plan(
        hasStory: Bool = true,
        isOwnStory: Bool = false,
        isPublicStory: Bool = true,
        hasAudioTranscript: Bool = false,
        canCompose: Bool = true
    ) -> StoryOptionsMenuPlan {
        StoryOptionsMenuPlan.resolve(
            hasStory: hasStory,
            isOwnStory: isOwnStory,
            isPublicStory: isPublicStory,
            hasAudioTranscript: hasAudioTranscript,
            canCompose: canCompose
        )
    }

    /// Les 16 combinaisons d'un lecteur devant une story, plus le menu sans story.
    static var everyReader: [StoryOptionsMenuPlan] {
        let combinations: [StoryOptionsMenuPlan] = (0..<16).map { (bits: Int) -> StoryOptionsMenuPlan in
            plan(
                isOwnStory: bits & 1 != 0,
                isPublicStory: bits & 2 != 0,
                hasAudioTranscript: bits & 4 != 0,
                canCompose: bits & 8 != 0
            )
        }
        return combinations + [plan(hasStory: false)]
    }
}

final class StoryOptionsMenuPlanTests: XCTestCase {

    func test_theMenu_ofSomeoneElsesPublicStory_inTheDecidedOrder() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: false, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.compose], [.share], [.report], [.close]])
        XCTAssertEqual(plan.shareEntries, [.exportVideo, .shareWithFriend])
    }

    func test_theMenu_ofOnesOwnStory_isTheSame_butDeletes() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: true, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.compose], [.share], [.delete], [.close]])
        XCTAssertEqual(plan.shareEntries, [.exportVideo, .shareWithFriend])
    }

    func test_close_isTheLastEntry_forEveryReader() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertEqual(plan.entries.last, .close, "« Fermer » doit être la DERNIÈRE option : \(plan.entries)")
            XCTAssertEqual(plan.sections.last, [.close])
        }
    }

    /// « Exporter en vidéo » est offert sur TOUTE story ; « Partager à un ami »
    /// emporte un lien `meeshy.me/l/…` qui s'ouvre sans compte : il reste réservé
    /// aux stories publiques.
    func test_exportVideo_isForEveryStory_theFriendLink_forPublicOnesOnly() {
        for isOwnStory in [true, false] {
            let friends = StoryOptionsMenuPlanFixture.plan(isOwnStory: isOwnStory, isPublicStory: false)
            XCTAssertEqual(friends.shareEntries, [.exportVideo])
            let open = StoryOptionsMenuPlanFixture.plan(isOwnStory: isOwnStory, isPublicStory: true)
            XCTAssertEqual(open.shareEntries, [.exportVideo, .shareWithFriend])
        }
    }

    func test_noEntryAppearsTwice_andTheMenuStaysShort() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertEqual(Set(plan.entries).count, plan.entries.count, "Doublon : \(plan.entries)")
            XCTAssertLessThanOrEqual(plan.entries.count, 6, "Trop d'entrées : \(plan.entries)")
            XCTAssertFalse(plan.sections.contains { $0.isEmpty }, "Aucune section vide.")
        }
    }

    func test_compose_followsWhatTheSlideOffers() {
        XCTAssertFalse(StoryOptionsMenuPlanFixture.plan(canCompose: false).entries.contains(.compose))
        XCTAssertTrue(StoryOptionsMenuPlanFixture.plan(canCompose: true).entries.contains(.compose))
    }

    func test_withoutAStory_theMenuOffersReadingAndClose_only() {
        let plan = StoryOptionsMenuPlanFixture.plan(hasStory: false, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.close]])
        XCTAssertTrue(plan.shareEntries.isEmpty)
    }
}

/// La vue rend le plan, rien que le plan.
final class StoryHeaderMenuWiringGuardTests: XCTestCase {

    private static let headerFile = "Meeshy/Features/Main/Views/StoryViewerView+Header.swift"

    private func header() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.headerFile)
    }

    private func headerBody() throws -> String {
        let text = try header()
        let start = try XCTUnwrap(text.range(of: "var body: some View {"))
        let end = try XCTUnwrap(text.range(of: "private var optionsMenuPlan", range: start.upperBound..<text.endIndex))
        return String(text[start.upperBound..<end.lowerBound])
    }

    /// Le bloc de code d'une entrée : de son `case` jusqu'au `case` suivant.
    private func entryBlock(_ marker: String) throws -> String {
        let text = try header()
        let start = try XCTUnwrap(text.range(of: marker), "\(marker) introuvable")
        let rest = text[start.upperBound...]
        let next = rest.range(of: "case .")?.lowerBound ?? rest.endIndex
        return String(rest[..<next])
    }

    func test_theStoryHeader_hasNoCloseButton() throws {
        let body = try headerBody()
        XCTAssertFalse(body.contains("FullscreenCloseButton("), "Le (X) a quitté l'en-tête : le glissement vers le bas ferme la story.")
        XCTAssertFalse(body.contains("dismissViewer()"), "La sortie passe par « Fermer », dans le menu.")
    }

    func test_theMenu_rendersThePlan_sectionBySection_andKeepsTheStoryLooping() throws {
        let body = try headerBody()
        XCTAssertTrue(body.contains("FullscreenMoreMenu(onPresentationChange: optionsMenuPresenceChange)"),
                      "Le menu ouvert reste une cause de BOUCLE (#9821).")
        XCTAssertTrue(body.contains("ForEach(plan.sections, id: \\.self)"))
        XCTAssertTrue(body.contains("optionsMenuItem(entry, shareEntries: plan.shareEntries)"))
        XCTAssertTrue(try entryBlock("case .share:").contains(".onAppear { optionsMenuPresenceChange?(true) }"),
                      "Le sous-menu « Partager » redit l'ouverture : la story boucle tant qu'on y choisit.")
        let hold = StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged: true))
        XCTAssertEqual(StoryPlaybackHold.endAction(for: hold), .restartInPlace,
                       "Menu ouvert : la story repart à son début, elle ne passe pas à la suivante.")
    }

    func test_everyEntry_keepsItsEffect() throws {
        let effects: [(String, String)] = [
            ("case .fullscreen:", "isFullscreenStorySession.toggle()"),
            ("case .transcript:", "showAudioTranscript.toggle()"),
            ("case .compose:", "demanderComposer(cible)"),
            ("case .exportVideo:", "showExportShareSheet = true"),
            ("case .shareWithFriend:", "await mintAndShareStory(story)"),
            ("case .report:", "showReportSheet = true"),
            ("case .delete:", "deleteCurrentStory()"),
            ("case .close:", "dismissViewer()"),
        ]
        for (marker, effect) in effects {
            XCTAssertTrue(try entryBlock(marker).contains(effect), "\(marker) doit appeler \(effect)")
        }
        XCTAssertTrue(try entryBlock("case .close:").contains("\"common.close\""))
        XCTAssertTrue(try entryBlock("case .shareWithFriend:").contains("\"story.viewer.share.friend\""))
        XCTAssertFalse(try header().contains("hors Meeshy"), "Le libellé ne dit pas « hors Meeshy ».")
    }

    /// « Partager à un ami » est la feuille du SYSTÈME, qui emporte le fichier :
    /// « Enregistrer la vidéo » y remplace l'entrée « Enregistrer » du menu.
    func test_shareWithFriend_carriesTheStoryFile_forSaveVideo() throws {
        let text = try header()
        XCTAssertTrue(text.contains("fileSource: .story(story, authorUsername: currentGroup?.username)"))
        XCTAssertTrue(text.contains("ShareSheet(activityItems: link.activityItems)"))
    }

    func test_theMenu_noLongerOffersSendRepostQuoteSaveOrStickers() throws {
        let body = try headerBody()
        for gone in ["story.viewer.action.send", "story.viewer.repostAsPost", "story.viewer.editAndRepostAsPost",
                     "story.viewer.action.save", "story.viewer.sticker.save", "StoryPhotoSaveService.shared.save("] {
            XCTAssertFalse(try header().contains(gone), "\(gone) a quitté le menu (#9953)")
        }
        XCTAssertFalse(body.contains("Divider()"), "Les groupes sont les sections du plan.")
    }

    /// « Exporter en vidéo » ouvre la feuille EXISTANTE au choix de la langue,
    /// présentée par le lecteur, et l'auteur de la story la signe.
    func test_exportVideo_opensTheExistingLanguageSheet() throws {
        let canvas = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        let headerCall = try XCTUnwrap(canvas.range(of: "StoryHeaderView("))
        XCTAssertTrue(canvas[headerCall.upperBound...].prefix(1200).contains("showExportShareSheet: $showExportShareSheet"))
        let viewer = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertTrue(viewer.contains(".sheet(isPresented: $showExportShareSheet"))
        XCTAssertTrue(viewer.contains("viewModel: exportShareViewModel, authorUsername: currentGroup?.username"))
        let sheet = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryExportShareSheet.swift")
        XCTAssertTrue(sheet.contains("languagePicker"), "La feuille garde le choix de la langue à graver.")
        XCTAssertTrue(sheet.contains("viewModel.startExport(story: story, authorUsername: authorUsername)"))
    }
}
