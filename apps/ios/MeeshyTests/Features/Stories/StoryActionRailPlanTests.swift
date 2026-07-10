import XCTest
@testable import Meeshy

/// Directive user 2026-07-10 : le set de boutons du rail d'actions du viewer
/// est calculé D'UN BLOC avant affichage (payload feed, compteurs inclus) et
/// figé pendant le slide. Ces tests pinnent la règle pure de résolution.
final class StoryActionRailPlanTests: XCTestCase {

    func test_resolve_ownStory_showsViewsExportForward_hidesReactReplyRepostTranslations() {
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
