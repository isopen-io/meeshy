import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryVisibilityUpdateTests
//
// Mise à jour optimiste + rollback du menu « Modifier la visibilité ».
// L'écriture locale précède l'appel réseau pour que le checkmark bouge tout de
// suite ; un échec doit restaurer EXACTEMENT l'état d'avant, sinon l'UI ment.

@MainActor
final class StoryVisibilityUpdateTests: XCTestCase {

    private func makeSUT(postService: MockPostService) -> StoryViewModel {
        StoryViewModel(postService: postService)
    }

    private func seed(_ sut: StoryViewModel, story: StoryItem) {
        sut.storyGroups = [
            StoryGroup(id: "user-1", username: "alice", avatarColor: "4ECDC4",
                       avatarURL: nil, stories: [story])
        ]
    }

    private func currentStory(_ sut: StoryViewModel, id: String) -> StoryItem? {
        sut.storyGroups.flatMap(\.stories).first { $0.id == id }
    }

    func test_applyVisibility_success_updatesLocalStory() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let before = postService.updateCallCount
        let ok = await sut.applyVisibility(storyId: "s1", visibility: "PRIVATE", userIds: nil)

        XCTAssertTrue(ok)
        XCTAssertEqual(postService.updateCallCount - before, 1, "compteur en delta : l'app hôte tourne")
        XCTAssertEqual(postService.lastUpdatePostId, "s1")
        XCTAssertEqual(postService.lastUpdateVisibility, "PRIVATE")
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibility, "PRIVATE")
    }

    func test_applyVisibility_withUserIds_forwardsThem() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let ok = await sut.applyVisibility(storyId: "s1", visibility: "ONLY", userIds: ["u1", "u2"])

        XCTAssertTrue(ok)
        XCTAssertEqual(postService.lastUpdateVisibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibilityUserIds, ["u1", "u2"])
    }

    func test_applyVisibility_failure_restoresPreviousValue() async {
        let postService = MockPostService()
        postService.createResult = .failure(URLError(.notConnectedToInternet))
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "EXCEPT", visibilityUserIds: ["u7"]))

        let ok = await sut.applyVisibility(storyId: "s1", visibility: "PUBLIC", userIds: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibility, "EXCEPT")
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibilityUserIds, ["u7"],
                       "le rollback doit restaurer la liste d'audience, pas seulement le mode")
    }

    func test_applyVisibility_unknownStory_returnsFalseWithoutNetworkCall() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let before = postService.updateCallCount
        let ok = await sut.applyVisibility(storyId: "inexistante", visibility: "PRIVATE", userIds: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(postService.updateCallCount - before, 0)
    }
}
