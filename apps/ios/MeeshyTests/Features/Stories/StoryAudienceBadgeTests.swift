import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'audience d'une story publiée (#20179) : l'icône même du sélecteur d'audience, lisible par VoiceOver ; le détail
/// (qui, combien de personnes choisies) n'est dit qu'à l'auteur, et seulement de ce que la passerelle lui sert.
@MainActor
final class StoryAudienceBadgeTests: XCTestCase {

    func test_plan_withoutServedAudience_showsNothing() {
        XCTAssertNil(StoryAudiencePlan.make(visibility: nil, userIds: nil, isAuthor: true))
        XCTAssertNil(StoryAudiencePlan.make(visibility: "", userIds: nil, isAuthor: false))
    }

    func test_plan_usesThePickerAudience_failClosed() {
        XCTAssertEqual(StoryAudiencePlan.make(visibility: "FRIENDS", userIds: nil, isAuthor: false)?.audience, .friends)
        XCTAssertEqual(StoryAudiencePlan.make(visibility: "blood", userIds: nil, isAuthor: false)?.audience, .blood)
        XCTAssertEqual(StoryAudiencePlan.make(visibility: "NEW_KIND", userIds: nil, isAuthor: false)?.audience, .private)
    }

    func test_plan_iconIsThePickerIcon() {
        for audience in PostVisibility.allCases {
            let plan = StoryAudiencePlan.make(visibility: audience.rawValue, userIds: nil, isAuthor: false)
            XCTAssertEqual(plan?.icon, audience.icon)
        }
    }

    func test_plan_chosenCount_isForTheAuthorOnly() {
        let author = StoryAudiencePlan.make(visibility: "ONLY", userIds: ["a", "b", "c"], isAuthor: true)
        XCTAssertEqual(author?.chosenCount, 3)
        let viewer = StoryAudiencePlan.make(visibility: "ONLY", userIds: ["a", "b", "c"], isAuthor: false)
        XCTAssertNil(viewer?.chosenCount)
    }

    func test_plan_chosenCount_onlyForAListAudience() {
        XCTAssertNil(StoryAudiencePlan.make(visibility: "FRIENDS", userIds: ["a"], isAuthor: true)?.chosenCount)
        XCTAssertNil(StoryAudiencePlan.make(visibility: "EXCEPT", userIds: nil, isAuthor: true)?.chosenCount)
        XCTAssertEqual(StoryAudiencePlan.make(visibility: "EXCEPT", userIds: ["a"], isAuthor: true)?.chosenCount, 1)
    }

    func test_spoken_namesTheAudience_andDetailsItForTheAuthor() {
        let viewer = StoryAudiencePlan.make(visibility: "CLOSE", userIds: nil, isAuthor: false)!
        XCTAssertTrue(viewer.spoken.contains(PostVisibility.close.label))
        XCTAssertFalse(viewer.spoken.contains(PostVisibility.close.who))
        let author = StoryAudiencePlan.make(visibility: "CLOSE", userIds: nil, isAuthor: true)!
        XCTAssertTrue(author.spoken.contains(PostVisibility.close.who))
    }

    func test_theHeader_mountsTheBadge() throws {
        let header = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Stories/Views/StoryViewerView+Header.swift"))
        XCTAssertTrue(header.contains("StoryAudienceBadge("))
    }
}
