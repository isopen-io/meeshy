import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryComposerViewModelRepostTests: XCTestCase {

    // MARK: - Tests

    func test_init_reposting_clonesActiveSlideOnly() {
        let story = makeStoryItem(id: "slide-1", content: "Hello")
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.slides[0].content, "Hello")
        XCTAssertNotEqual(vm.slides[0].id, "slide-1", "Cloned slide must have a fresh ID")
    }

    func test_init_reposting_addsLockedBadgeAtBottomCenter() {
        let story = makeStoryItem()
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")

        let texts = vm.currentEffects.textObjects ?? []
        let lockedBadges = texts.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1)
        let badge = lockedBadges[0]
        XCTAssertEqual(badge.y, 0.92, accuracy: 0.001)
        XCTAssertEqual(badge.x, 0.5, accuracy: 0.001)
        XCTAssertTrue(badge.content.contains("@alice"))
    }

    func test_init_reposting_propagatesIds_rootCase() {
        let story = makeStoryItem(id: "root-1", repostOfId: nil, originalRepostOfId: nil)
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "root-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_propagatesIds_chainedCase() {
        let story = makeStoryItem(
            id: "intermediate-1",
            repostOfId: "root-1",
            originalRepostOfId: "root-1"
        )
        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")
        XCTAssertEqual(vm.repostOfId, "intermediate-1")
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }

    func test_init_reposting_preloadTaskCancelsOnDeinit() async {
        var vm: StoryComposerViewModel? = StoryComposerViewModel(
            reposting: makeStoryItemWithMedia(),
            authorHandle: "alice"
        )
        weak var weakVM = vm
        vm = nil
        await Task.yield()
        XCTAssertNil(weakVM, "VM must be deallocated, preload Task must release self")
    }

    // MARK: - Factories

    private func makeStoryItem(
        id: String = "story-x",
        content: String? = "Hello",
        repostOfId: String? = nil,
        originalRepostOfId: String? = nil,
        media: [FeedMedia] = []
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: media,
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId,
            visibility: "PUBLIC",
            isViewed: false
        )
    }

    private func makeStoryItemWithMedia() -> StoryItem {
        let media = FeedMedia(
            id: "m1",
            type: .image,
            url: "/api/v1/attachments/file/test.jpg"
        )
        return makeStoryItem(id: "story-with-media", media: [media])
    }
}
