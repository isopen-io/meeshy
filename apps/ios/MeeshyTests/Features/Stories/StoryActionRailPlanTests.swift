import XCTest
@testable import Meeshy

/// Directive user 2026-07-10 : le set de boutons du rail d'actions du viewer
/// est calculé D'UN BLOC avant affichage (payload feed, compteurs inclus) et
/// figé pendant le slide. Ces tests pinnent la règle pure de résolution.
final class StoryActionRailPlanTests: XCTestCase {

    func test_resolve_ownStory_showsViewsExportForward_hidesReactReplyRepost() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: true,
            canReply: true,
            isPublicStory: true,
            hasAudibleSound: false,
            commentCount: 0,
            hasTranslatableContent: true
        )

        XCTAssertTrue(plan.showsViews)
        XCTAssertTrue(plan.showsExport)
        XCTAssertTrue(plan.showsForward)
        XCTAssertFalse(plan.showsReact)
        XCTAssertFalse(plan.showsReply)
        XCTAssertFalse(plan.showsRepost)
    }

    /// Changement 2026-07-25 : l'auteur voit AUSSI le bouton traductions. Il
    /// choisit déjà la langue de son export MP4 ; lui refuser l'exploration des
    /// langues dans le viewer était une asymétrie sans justification produit.
    func test_resolve_translations_visibleToAuthorAndReaderAlike() {
        let author = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: true
        )
        let reader = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: true
        )

        XCTAssertTrue(author.showsTranslations)
        XCTAssertTrue(reader.showsTranslations)
    }

    /// Sans texte ni audio à traduire, le bouton reste absent pour tout le monde.
    func test_resolve_translations_hiddenWithoutTranslatableContent() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )

        XCTAssertFalse(plan.showsTranslations)
    }

    func test_resolve_othersPublicStory_showsReactReplyForwardRepostTranslations() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false,
            canReply: true,
            isPublicStory: true,
            hasAudibleSound: true,
            commentCount: 3,
            hasTranslatableContent: true
        )

        XCTAssertTrue(plan.showsReact)
        XCTAssertTrue(plan.showsReply)
        XCTAssertTrue(plan.showsForward)
        XCTAssertTrue(plan.showsRepost)
        XCTAssertTrue(plan.showsSound)
        XCTAssertTrue(plan.showsComments)
        XCTAssertTrue(plan.showsTranslations)
        XCTAssertFalse(plan.showsViews)
        XCTAssertFalse(plan.showsExport)
    }

    func test_resolve_othersPrivateStory_hidesRepost() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false,
            canReply: false,
            isPublicStory: false,
            hasAudibleSound: false,
            commentCount: 0,
            hasTranslatableContent: false
        )

        XCTAssertFalse(plan.showsRepost)
        XCTAssertFalse(plan.showsReply)
        XCTAssertFalse(plan.showsViews)
        XCTAssertFalse(plan.showsExport)
    }

    func test_resolve_commentsMembership_decidedByEntryCount_only() {
        let without = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )
        let with = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 1, hasTranslatableContent: false
        )

        XCTAssertFalse(without.showsComments)
        XCTAssertTrue(with.showsComments)
    }

    func test_resolve_soundMembership_followsAudibleSound() {
        let silent = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )
        let audible = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: false,
            hasAudibleSound: true, commentCount: 0, hasTranslatableContent: false
        )

        XCTAssertFalse(silent.showsSound)
        XCTAssertTrue(audible.showsSound)
    }
}

// MARK: - Ré-évaluation du rail à l'arrivée du probe audio

/// Le rail est figé à l'entrée du slide (directive 2026-07-10), mais la présence
/// d'une piste audio dans une vidéo est établie par un probe ASYNCHRONE qui
/// conclut souvent après ce gel. Sans ré-évaluation, une story sonore restait
/// sans bouton son pour toute sa lecture (constaté 2026-07-25).
extension StoryActionRailPlanTests {

    func test_sidebar_refreezesRailWhenSoundBecomesAvailable() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: storyHasAudibleSound)"),
            "le rail doit être ré-évalué quand le probe audio conclut")
        XCTAssertTrue(
            source.contains("guard !wasAudible, isAudible else { return }"),
            "la ré-évaluation doit rester à sens unique : un bouton n'est jamais retiré en cours de lecture")
    }
}
