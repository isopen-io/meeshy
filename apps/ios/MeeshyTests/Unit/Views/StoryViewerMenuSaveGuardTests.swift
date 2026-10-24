import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le menu « … » de la story** (#9953, revu par le porteur le 2026-10-24).
///
/// Le même menu pour TOUT lecteur, sa story ou celle d'un autre :
/// Plein écran · Transcription ▸ langue (si présente) · Composer · Exporter en
/// vidéo · Signaler / Supprimer · Fermer.
///
/// **Le menu ne double pas le rail.** « Envoyer » ouvre la feuille de partage
/// MEESHY — envoi à des personnes, republication en story, post ou réel,
/// studio, partage hors de Meeshy (#12644) ; « Republier » republie en story
/// d'un tap. « Partager à un ami » (la feuille du système) et « Republier en
/// post / en réel » quittent donc le menu, et « Composer » reste la
/// republication qui passe par le composer. Le (X) de l'en-tête est retiré :
/// le glissement vers le bas ferme, « Fermer » est la dernière entrée.
enum StoryOptionsMenuPlanFixture {
    static func plan(
        hasStory: Bool = true,
        isOwnStory: Bool = false,
        hasAudioTranscript: Bool = false,
        canCompose: Bool = true
    ) -> StoryOptionsMenuPlan {
        StoryOptionsMenuPlan.resolve(
            hasStory: hasStory,
            isOwnStory: isOwnStory,
            hasAudioTranscript: hasAudioTranscript,
            canCompose: canCompose
        )
    }

    /// Les 8 combinaisons d'un lecteur devant une story, plus le menu sans story.
    static var everyReader: [StoryOptionsMenuPlan] {
        let combinations: [StoryOptionsMenuPlan] = (0..<8).map { (bits: Int) -> StoryOptionsMenuPlan in
            plan(
                isOwnStory: bits & 1 != 0,
                hasAudioTranscript: bits & 2 != 0,
                canCompose: bits & 4 != 0
            )
        }
        return combinations + [plan(hasStory: false)]
    }
}

final class StoryOptionsMenuPlanTests: XCTestCase {

    func test_theMenu_ofSomeoneElsesStory_inTheDecidedOrder() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: false, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.compose, .exportVideo], [.report], [.close]])
    }

    func test_theMenu_ofOnesOwnStory_isTheSame_butDeletes() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: true, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.compose, .exportVideo], [.delete], [.close]])
    }

    func test_close_isTheLastEntry_forEveryReader() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertEqual(plan.entries.last, .close, "« Fermer » doit être la DERNIÈRE option : \(plan.entries)")
            XCTAssertEqual(plan.sections.last, [.close])
        }
    }

    /// « Exporter en vidéo » est offert sur TOUTE story, qu'on puisse la
    /// recomposer ou non.
    func test_exportVideo_isForEveryStory() {
        for plan in StoryOptionsMenuPlanFixture.everyReader.dropLast() {
            XCTAssertTrue(plan.entries.contains(.exportVideo), "\(plan.entries)")
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

    /// Le sous-menu de la transcription, de sa déclaration à la règle d'offre.
    private func transcriptMenu() throws -> String {
        let text = try header()
        let start = try XCTUnwrap(text.range(of: "private var transcriptMenuContent: some View {"))
        let end = try XCTUnwrap(text.range(of: "private func resolveComposableSlide()", range: start.upperBound..<text.endIndex))
        return String(text[start.upperBound..<end.lowerBound])
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
        XCTAssertTrue(body.contains("optionsMenuItem(entry)"))
        XCTAssertTrue(try entryBlock("case .transcript:").contains(".onAppear { optionsMenuPresenceChange?(true) }"),
                      "Le sous-menu « Transcription » redit l'ouverture : la story boucle tant qu'on y choisit.")
        let hold = StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged: true))
        XCTAssertEqual(StoryPlaybackHold.endAction(for: hold), .restartInPlace,
                       "Menu ouvert : la story repart à son début, elle ne passe pas à la suivante.")
    }

    func test_everyEntry_keepsItsEffect() throws {
        let effects: [(String, String)] = [
            ("case .fullscreen:", "isFullscreenStorySession.toggle()"),
            ("case .transcript:", "transcriptMenuContent"),
            ("case .compose:", "demanderComposer(cible)"),
            ("case .exportVideo:", "showExportShareSheet = true"),
            ("case .report:", "showReportSheet = true"),
            ("case .remove:", "ContentRemovalPresenter.present(.story) { deleteCurrentStory($0) }"),
            ("case .delete:", "deleteCurrentStory(nil)"),
            ("case .close:", "dismissViewer()"),
        ]
        for (marker, effect) in effects {
            XCTAssertTrue(try entryBlock(marker).contains(effect), "\(marker) doit appeler \(effect)")
        }
        XCTAssertTrue(try entryBlock("case .close:").contains("\"common.close\""))
        XCTAssertTrue(try entryBlock("case .exportVideo:").contains("\"story.export.share.title\""))
    }

    /// **Le menu ne double pas le rail** (porteur, 2026-10-24) : l'envoi, la
    /// republication en post ou en réel et le partage hors de Meeshy vivent
    /// dans la feuille Meeshy qu'ouvre « Envoyer ».
    func test_theMenu_doesNotDuplicateTheRail_orTheMeeshySheet() throws {
        let text = try header()
        for gone in ["story.viewer.share.friend", "mintAndShareStory", "ShareSheet(activityItems:",
                     "StoryDirectRepost.publish(", "story.viewer.repostAsPost", "story.viewer.repostAsReel",
                     "story.viewer.action.send", "story.viewer.editAndRepostAsPost", "editAndRepostAsPostSource",
                     "story.viewer.action.save", "story.viewer.sticker.save", "StoryPhotoSaveService.shared.save("] {
            XCTAssertFalse(text.contains(gone), "\(gone) a quitté le menu (#9953)")
        }
        XCTAssertFalse(try headerBody().contains("Divider()"), "Les groupes sont les sections du plan.")
        XCTAssertFalse(text.contains("hors Meeshy"), "Le libellé ne dit pas « hors Meeshy ».")
    }

    /// Le sous-menu « Transcription » choisit AUSSI la langue (#12646), par
    /// l'état d'exploration du rail — jamais un second.
    func test_theTranscriptSubmenu_offersEveryLanguage_throughTheRailsState() throws {
        let menu = try transcriptMenu()
        XCTAssertTrue(menu.contains("ForEach(transcriptMenu.languages)"))
        XCTAssertTrue(menu.contains("transcriptMenu.select(language.id)"))
        XCTAssertTrue(menu.contains("showAudioTranscript = true"))
        XCTAssertTrue(menu.contains("showAudioTranscript = false"), "« Masquer » quand elle est affichée.")
        let layers = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView+Canvas+Layers.swift"))
        let headerCall = try XCTUnwrap(layers.range(of: "StoryHeaderView("))
        let call = String(layers[headerCall.upperBound...].prefix(1400))
        XCTAssertTrue(call.contains("transcriptMenu: StoryReaderContentRules.transcriptMenu(of: currentStory, chain: resolvedViewerLanguageChain, select: onSelectLanguageOverride)"))
    }

    /// « Exporter en vidéo » ouvre la feuille EXISTANTE au choix de la langue,
    /// présentée par le lecteur, et l'auteur de la story la signe.
    func test_exportVideo_opensTheExistingLanguageSheet() throws {
        // Le chrome haut (donc l'appel de l'en-tête) vit dans `+Canvas+Layers`, et les feuilles dans
        // `StoryViewerSheets` : le lecteur ne fait plus que les monter.
        let canvas = MyStoriesSourceCorpus.strippingComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))
        let headerCall = try XCTUnwrap(canvas.range(of: "StoryHeaderView("))
        XCTAssertTrue(canvas[headerCall.upperBound...].prefix(1600).contains("showExportShareSheet: $showExportShareSheet"))
        let viewer = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerSheets.swift")
        XCTAssertTrue(viewer.contains(".sheet(isPresented: $showExportShareSheet"))
        XCTAssertTrue(viewer.contains("viewModel: exportShareViewModel, author: currentGroup.map(StoryExportAuthor.init(group:))"))
        let sheet = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryExportShareSheet.swift")
        XCTAssertTrue(sheet.contains("languagePicker"), "La feuille garde le choix de la langue à graver.")
        XCTAssertTrue(sheet.contains("viewModel.startExport(story: story, author: author)"))
    }
}

/// **Une mécanique, trois cibles** (#9953) : le rail republie en story, la
/// feuille Meeshy en story, post ou réel (#12644) — `RepostIntent.simple` remis
/// à `RepostPublisher`, seule la cible change.
@MainActor
final class StoryDirectRepostTests: XCTestCase {

    func test_eachDestination_targetsItsFormat() {
        XCTAssertEqual(StoryRepostDestination.story.targetType, .story)
        XCTAssertEqual(StoryRepostDestination.post.targetType, .post)
        XCTAssertEqual(StoryRepostDestination.reel.targetType, .reel)
    }

    func test_eachSheetTarget_mapsToItsDestination() {
        XCTAssertEqual(StoryRepostDestination(.story), .story)
        XCTAssertEqual(StoryRepostDestination(.post), .post)
        XCTAssertEqual(StoryRepostDestination(.reel), .reel)
    }

    func test_eachDestination_announcesWhereItLanded() {
        let messages = StoryRepostDestination.allCases.map { StoryDirectRepost.successMessage(for: $0) }
        XCTAssertFalse(messages.contains { $0.isEmpty })
        XCTAssertEqual(Set(messages).count, StoryRepostDestination.allCases.count,
                       "Story, post et réel ne disent pas la même chose.")
    }

    func test_theThreeGestures_shareOneWriter() throws {
        let sidebar = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(sidebar.contains(".simple(postId: storyId, targetType: destination.targetType, visibility: nil)"))
        XCTAssertTrue(sidebar.contains("StoryViewerParticipationStore.shared.note(.reposted, storyId: storyId)"),
                      "Le rail pose l'anneau « republié » comme le faisait la porte de republication.")
    }
}

// MARK: - « Composer » au rail sur la story d'une AUTRE personne (#9953, v4)

final class StoryRailComposeTests: XCTestCase {

    private func plan(isOwnStory: Bool, canCompose: Bool) -> StoryActionRailPlan {
        StoryActionRailPlan.resolve(isOwnStory: isOwnStory, canReply: true, isPublicStory: true,
                                    hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false,
                                    canCompose: canCompose)
    }

    func test_compose_isOnTheRail_forSomeoneElsesComposableStory() {
        XCTAssertTrue(plan(isOwnStory: false, canCompose: true).showsCompose)
    }

    func test_compose_staysOffTheRail_onOnesOwnStory_orWhenTheSlideOffersNothing() {
        XCTAssertFalse(plan(isOwnStory: true, canCompose: true).showsCompose, "Sur sa propre story, le rail ne change pas.")
        XCTAssertFalse(plan(isOwnStory: false, canCompose: false).showsCompose)
    }

    func test_theRailButton_opensTheSameDoorAsTheMenu() throws {
        let rail = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        let button = try XCTUnwrap(rail.range(of: "if railPlan.showsCompose {"))
        let block = String(rail[button.upperBound...].prefix(500))
        XCTAssertTrue(block.contains("demanderComposer(cible)"), "Même porte que l'entrée « Composer » du menu.")
        XCTAssertTrue(block.contains("\"message.compose.title\""))
        XCTAssertTrue(rail.contains("@Environment(\\.meeshyComposeSeedRequest) private var demanderComposer"))
        XCTAssertTrue(rail.contains("canCompose: railPlan.showsCompose"),
                      "La réconciliation des commentaires re-gèle le rail sans perdre « Composer ».")
        let header = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Header.swift")
        XCTAssertTrue(header.contains("case .compose:"), "L'entrée du menu reste.")
    }
}
