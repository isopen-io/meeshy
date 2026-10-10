import XCTest
@testable import Meeshy

/// **« ENREGISTRER » DANS LE MENU (…) DU LECTEUR, POUR TOUT LECTEUR** (#8823).
///
/// Demande porteur 2026-09-30 : le menu (…) de `StoryHeaderView` appelle la
/// sauvegarde EXISTANTE — `StoryPhotoSaveService.shared.save(story:)`, la même
/// que le rail auteur et « Mes stories » — et l'offre à tout lecteur, pas
/// seulement à l'auteur. Un `Menu` SwiftUI ne s'inspecte pas au rendu : la
/// garde lit la source pour l'appel, et le PLAN du menu pour l'offre.
final class StoryViewerMenuSaveGuardTests: XCTestCase {

    private static let headerFile = "Meeshy/Features/Main/Views/StoryViewerView+Header.swift"
    private static let saveCall = "StoryPhotoSaveService.shared.save(story: story, authorUsername: group.username)"

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: Self.headerFile)
    }

    func test_menu_callsTheExistingStorySave() throws {
        let text = try source()
        XCTAssertTrue(text.contains(Self.saveCall),
                      "Le menu (…) doit appeler la sauvegarde existante, jamais une seconde implémentation.")
    }

    /// #9953 — l'offre ne se lit plus dans un `if isOwnStory` de la vue : elle
    /// se décide dans `StoryOptionsMenuPlan`, que la vue rend tel quel.
    func test_menu_offersSave_toTheAuthorAndToEveryOtherReader() {
        for isOwnStory in [true, false] {
            let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: isOwnStory)
            XCTAssertTrue(plan.entries.contains(.save),
                          "« Enregistrer » est offert à TOUT lecteur (arbitrage porteur #8823) — isOwnStory=\(isOwnStory)")
        }
    }
}

enum StoryOptionsMenuPlanFixture {
    static func plan(
        hasStory: Bool = true,
        isOwnStory: Bool = false,
        isPublicStory: Bool = true,
        hasAudioTranscript: Bool = false,
        canCompose: Bool = true,
        hasSavableStickers: Bool = false
    ) -> StoryOptionsMenuPlan {
        StoryOptionsMenuPlan.resolve(
            hasStory: hasStory,
            isOwnStory: isOwnStory,
            isPublicStory: isPublicStory,
            hasAudioTranscript: hasAudioTranscript,
            canCompose: canCompose,
            hasSavableStickers: hasSavableStickers
        )
    }

    /// Les 32 combinaisons d'un lecteur devant une story, plus le menu sans story.
    static var everyReader: [StoryOptionsMenuPlan] {
        let combinations: [StoryOptionsMenuPlan] = (0..<32).map { (bits: Int) -> StoryOptionsMenuPlan in
            plan(
                isOwnStory: bits & 1 != 0,
                isPublicStory: bits & 2 != 0,
                hasAudioTranscript: bits & 4 != 0,
                canCompose: bits & 8 != 0,
                hasSavableStickers: bits & 16 != 0
            )
        }
        return combinations + [plan(hasStory: false)]
    }
}

// MARK: - Le menu « … » de la story en quelques entrées, « Fermer » en dernier (#9953)

/// Porteur, 2026-10-10 : « il faut enlever (X) à gauche qui est inutile, le
/// swipe bas ferme la story, mais en cas de non prise en charge il faut le
/// mettre comme dernière option dans (...) » — en préservant plein écran,
/// enregistrer, composer, republier en post, citer en post, partager et
/// partager hors Meeshy, et en ramenant le menu à quelques options.
final class StoryOptionsMenuPlanTests: XCTestCase {

    func test_close_isTheLastEntry_forEveryReader() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertEqual(plan.entries.last, .close, "« Fermer » doit être la DERNIÈRE option : \(plan.entries)")
            XCTAssertEqual(plan.sections.last, [.close], "« Fermer » a sa propre section, sous toutes les autres.")
        }
    }

    func test_theSevenCapabilities_areReachable_onAPublicStoryOfSomeoneElse() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: false, isPublicStory: true, canCompose: true)
        for entry in [StoryOptionsMenuEntry.fullscreen, .save, .compose, .share] {
            XCTAssertTrue(plan.entries.contains(entry), "\(entry) doit être atteignable depuis le menu")
        }
        XCTAssertEqual(plan.shareEntries, [.send, .repostAsPost, .quoteAsPost, .shareOutside],
                       "Partager dans Meeshy, republier, citer, puis partager hors Meeshy — dans le sous-menu « Partager ».")
    }

    func test_theAuthor_keepsFullscreenSaveComposeAndEveryShareOfHisStory() {
        let plan = StoryOptionsMenuPlanFixture.plan(isOwnStory: true, isPublicStory: true, canCompose: true)
        for entry in [StoryOptionsMenuEntry.fullscreen, .save, .compose, .share, .delete] {
            XCTAssertTrue(plan.entries.contains(entry), "\(entry) doit rester offert à l'auteur")
        }
        XCTAssertEqual(plan.shareEntries, [.send, .shareOutside, .exportVideo])
        XCTAssertFalse(plan.entries.contains(.report), "On ne signale pas sa propre story.")
    }

    /// Le lien `meeshy.me/l/…` s'ouvre sans compte : il élargirait l'audience
    /// d'une story FRIENDS ou PRIVATE. Republier et citer restent offerts, la
    /// loi d'audience bornant le résultat côté serveur.
    func test_onlyTheExternalLink_dependsOnThePublicAudience() {
        let friends = StoryOptionsMenuPlanFixture.plan(isOwnStory: false, isPublicStory: false)
        XCTAssertEqual(friends.shareEntries, [.send, .repostAsPost, .quoteAsPost])
        let ownFriends = StoryOptionsMenuPlanFixture.plan(isOwnStory: true, isPublicStory: false)
        XCTAssertEqual(ownFriends.shareEntries, [.send, .exportVideo])
    }

    func test_noEntryAppearsTwice() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertEqual(Set(plan.entries).count, plan.entries.count, "Doublon dans le menu : \(plan.entries)")
            XCTAssertEqual(Set(plan.shareEntries).count, plan.shareEntries.count, "Doublon dans « Partager » : \(plan.shareEntries)")
        }
    }

    /// Avant #9953 le menu d'un lecteur alignait jusqu'à ONZE entrées au
    /// premier niveau, dont « Partager » et « Voir le profil » en double du
    /// rail et de l'en-tête.
    func test_theMenu_holdsAFewEntriesOnly() {
        for plan in StoryOptionsMenuPlanFixture.everyReader {
            XCTAssertLessThanOrEqual(plan.entries.count, 8, "Trop d'entrées au premier niveau : \(plan.entries)")
            XCTAssertLessThanOrEqual(plan.sections.count, 5)
        }
    }

    func test_withoutAStory_theMenuOffersReadingAndClose_only() {
        let plan = StoryOptionsMenuPlanFixture.plan(hasStory: false, hasAudioTranscript: true)
        XCTAssertEqual(plan.sections, [[.fullscreen, .transcript], [.close]])
        XCTAssertTrue(plan.shareEntries.isEmpty)
    }

    func test_optionalEntries_followWhatTheSlideOffers() {
        let bare = StoryOptionsMenuPlanFixture.plan(hasAudioTranscript: false, canCompose: false, hasSavableStickers: false)
        XCTAssertFalse(bare.entries.contains(.transcript))
        XCTAssertFalse(bare.entries.contains(.compose))
        XCTAssertFalse(bare.entries.contains(.saveStickers))
        let rich = StoryOptionsMenuPlanFixture.plan(hasAudioTranscript: true, canCompose: true, hasSavableStickers: true)
        XCTAssertEqual(rich.sections[0], [.fullscreen, .transcript])
        XCTAssertEqual(rich.sections[1], [.save, .saveStickers, .compose])
        let ownWithStickers = StoryOptionsMenuPlanFixture.plan(isOwnStory: true, hasSavableStickers: true)
        XCTAssertFalse(ownWithStickers.entries.contains(.saveStickers), "Ses propres stickers sont déjà à soi.")
    }
}

/// La vue rend le plan, rien que le plan : l'en-tête ne porte plus de (X), et
/// chaque entrée du plan a son effet.
final class StoryHeaderMenuWiringGuardTests: XCTestCase {

    private func header() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Header.swift")
    }

    private func headerBody() throws -> String {
        let text = try header()
        let start = try XCTUnwrap(text.range(of: "var body: some View {"))
        let end = try XCTUnwrap(text.range(of: "private var optionsMenuPlan", range: start.upperBound..<text.endIndex))
        return String(text[start.upperBound..<end.lowerBound])
    }

    func test_theStoryHeader_hasNoCloseButton() throws {
        let body = try headerBody()
        XCTAssertFalse(body.contains("FullscreenCloseButton("), "Le (X) a quitté l'en-tête : le glissement vers le bas ferme la story.")
        XCTAssertFalse(body.contains("xmark"))
        XCTAssertFalse(body.contains("dismissViewer()"), "La sortie passe par « Fermer », dans le menu.")
    }

    func test_theMenu_rendersThePlan_sectionBySection() throws {
        let body = try headerBody()
        XCTAssertTrue(body.contains("FullscreenMoreMenu(onPresentationChange: optionsMenuPresenceChange)"),
                      "Le menu ouvert reste une cause de BOUCLE (#9821).")
        XCTAssertTrue(body.contains("ForEach(plan.sections, id: \\.self)"))
        XCTAssertTrue(body.contains("optionsMenuItem(entry, shareEntries: plan.shareEntries)"))
    }

    func test_close_dismissesTheViewer() throws {
        let text = try header()
        let close = try XCTUnwrap(text.range(of: "case .close:"))
        let tail = String(text[close.upperBound...].prefix(300))
        XCTAssertTrue(tail.contains("dismissViewer()"))
        XCTAssertTrue(tail.contains("\"common.close\""), "Le libellé est celui de toutes les sorties : « Fermer ».")
    }

    /// Chaque capacité garde son effet d'avant #9953 — l'appel qui la réalise.
    func test_everyEntry_keepsItsEffect() throws {
        let text = try header()
        let effects: [(String, String)] = [
            ("case .fullscreen:", "isFullscreenStorySession.toggle()"),
            ("case .save:", "StoryPhotoSaveService.shared.save(story: story, authorUsername: group.username)"),
            ("case .compose:", "demanderComposer(cible)"),
            ("case .send:", "sharedContentWrapper = SharedContentWrapper("),
            ("case .repostAsPost:", "repostAsPostDirect()"),
            ("case .quoteAsPost:", "editAndRepostAsPostSource = RepostPostSourceWrapper("),
            ("case .shareOutside:", "await mintAndShareStory(story)"),
            ("case .exportVideo:", "showExportShareSheet = true"),
            ("case .report:", "showReportSheet = true"),
            ("case .delete:", "deleteCurrentStory()"),
        ]
        for (marker, effect) in effects {
            let start = try XCTUnwrap(text.range(of: marker), "\(marker) introuvable")
            let rest = text[start.upperBound...]
            let next = rest.range(of: "case .")?.lowerBound ?? rest.endIndex
            XCTAssertTrue(rest[..<next].contains(effect), "\(marker) doit appeler \(effect)")
        }
    }

    /// Le sous-menu « Partager » redit l'ouverture : la story boucle tant que
    /// l'on y choisit (#9821).
    func test_theShareSubmenu_keepsTheStoryLooping() throws {
        let text = try header()
        let share = try XCTUnwrap(text.range(of: "case .share:"))
        let tail = String(text[share.upperBound...].prefix(400))
        XCTAssertTrue(tail.contains(".onAppear { optionsMenuPresenceChange?(true) }"))
        let hold = StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged: true))
        XCTAssertEqual(StoryPlaybackHold.endAction(for: hold), .restartInPlace,
                       "Menu ouvert : la story repart à son début, elle ne passe pas à la suivante.")
    }

    /// Le canvas remet au menu la feuille d'export de l'auteur.
    func test_theCanvas_handsTheExportSheetToTheHeader() throws {
        let canvas = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        XCTAssertTrue(canvas.contains("showExportShareSheet: $showExportShareSheet"))
    }
}
