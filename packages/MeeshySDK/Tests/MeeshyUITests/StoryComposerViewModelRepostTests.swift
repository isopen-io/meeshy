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

        let texts = vm.currentEffects.textObjects
        let lockedBadges = texts.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1)
        let badge = lockedBadges[0]
        XCTAssertEqual(badge.y, 0.92, accuracy: 0.001)
        XCTAssertEqual(badge.x, 0.5, accuracy: 0.001)
        XCTAssertTrue(badge.text.contains("@alice"))
    }

    func test_init_reposting_repostOfRepost_doesNotStackAttributionBadges() {
        // Source story is ITSELF a repost: ses effects portent déjà un badge
        // d'attribution verrouillé ("Reposté de @alice", persisté en base car
        // sanitizedForServerPublish ne strip pas les text objects locked).
        // Reposter ce repost ne doit PAS empiler un 2e badge au même point
        // (x:0.5, y:0.92) — un seul badge, attribuant à la source immédiate.
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(
                id: "stale-badge",
                text: "Reposté de @alice",
                x: 0.5, y: 0.92,
                scale: 1.0, rotation: 0,
                fontSize: 14,
                textStyle: "bold",
                textColor: "FFFFFF",
                textAlign: "center",
                textBg: "6366F1",
                isLocked: true
            )
        ]
        let source = makeStoryItem(id: "repost-of-alice", storyEffects: effects)
        let vm = StoryComposerViewModel(reposting: source, authorHandle: "bob")

        let lockedBadges = vm.currentEffects.textObjects.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1, "Reposting a repost must not stack attribution badges")
        XCTAssertTrue(lockedBadges[0].text.contains("@bob"), "Le badge attribue à la source immédiate")
        XCTAssertFalse(
            vm.currentEffects.textObjects.contains { $0.text.contains("@alice") },
            "Le badge @alice obsolète doit être strippé"
        )
    }

    func test_init_reposting_preservesNonLockedTextObjects() {
        // Les text objects ÉDITABLES de la source (légende de l'auteur) doivent
        // survivre à l'import — seul le badge verrouillé est remplacé.
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "caption", text: "Mon texte", x: 0.5, y: 0.3,
                            scale: 1.0, rotation: 0, fontSize: 18, textStyle: "regular",
                            textColor: "FFFFFF", textAlign: "center", textBg: nil, isLocked: nil),
            StoryTextObject(id: "stale-badge", text: "Reposté de @alice", x: 0.5, y: 0.92,
                            scale: 1.0, rotation: 0, fontSize: 14, textStyle: "bold",
                            textColor: "FFFFFF", textAlign: "center", textBg: "6366F1", isLocked: true)
        ]
        let source = makeStoryItem(id: "repost-of-alice", storyEffects: effects)
        let vm = StoryComposerViewModel(reposting: source, authorHandle: "bob")

        XCTAssertTrue(
            vm.currentEffects.textObjects.contains { $0.text == "Mon texte" && $0.isLocked != true },
            "La légende éditable de la source doit être préservée"
        )
        XCTAssertEqual(vm.currentEffects.textObjects.filter { $0.isLocked == true }.count, 1)
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
        media: [FeedMedia] = [],
        storyEffects: StoryEffects? = nil
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: media,
            storyEffects: storyEffects,
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
