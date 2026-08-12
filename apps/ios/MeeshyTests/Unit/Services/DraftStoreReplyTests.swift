import XCTest
@testable import Meeshy

@MainActor
final class DraftStoreReplyTests: XCTestCase {

    private static let suiteName = "DraftStoreReplyTests"

    private func makeSUT() -> DraftStore {
        let defaults = UserDefaults(suiteName: Self.suiteName)!
        let store = DraftStore(userDefaults: defaults)
        store.clearAll()
        return store
    }

    // MARK: - clearReplyReference Behavior

    func test_clearReplyReference_setsReplyToIdToNil() {
        let sut = makeSUT()
        let draft = MessageDraft(text: "hi", replyToId: "story_1")
        sut.save(draft, for: "conv1")

        sut.clearReplyReference(conversationId: "conv1")

        XCTAssertNil(sut.load(for: "conv1")?.replyToId)
    }

    func test_clearReplyReference_preservesText() {
        let sut = makeSUT()
        let draft = MessageDraft(text: "mon texte", replyToId: "story_1")
        sut.save(draft, for: "conv1")

        sut.clearReplyReference(conversationId: "conv1")

        XCTAssertEqual(sut.load(for: "conv1")?.text, "mon texte")
    }

    func test_clearReplyReference_preservesOtherReplyMetadata_butClearsThemTooSoUiBannerHides() {
        // The reply banner reads `replyToId` to decide whether to show. Clearing
        // replyToId is sufficient to hide it. Author/preview metadata become
        // orphaned but harmless; we still assert text+effectFlags are preserved
        // because those belong to the in-progress message body, not the reply
        // context.
        let sut = makeSUT()
        let draft = MessageDraft(
            text: "draft body",
            replyToId: "story_1",
            replyAuthorName: "alice",
            replyPreviewText: "previously",
            replyIsMe: false,
            effectFlags: 0b101,
            isBlurEnabled: true
        )
        sut.save(draft, for: "conv1")

        sut.clearReplyReference(conversationId: "conv1")

        let reloaded = sut.load(for: "conv1")
        XCTAssertNil(reloaded?.replyToId)
        XCTAssertEqual(reloaded?.text, "draft body")
        XCTAssertEqual(reloaded?.effectFlags, 0b101)
        XCTAssertEqual(reloaded?.isBlurEnabled, true)
    }

    func test_clearReplyReference_persistsImmediately_acrossStoreInstances() {
        let defaults = UserDefaults(suiteName: Self.suiteName)!
        let first = DraftStore(userDefaults: defaults)
        first.clearAll()
        first.save(MessageDraft(text: "hi", replyToId: "story_1"), for: "conv1")

        first.clearReplyReference(conversationId: "conv1")

        let second = DraftStore(userDefaults: defaults)
        XCTAssertNil(second.load(for: "conv1")?.replyToId)
        XCTAssertEqual(second.load(for: "conv1")?.text, "hi")
    }

    func test_clearReplyReference_unknownConversationId_isNoOp() {
        let sut = makeSUT()
        sut.clearReplyReference(conversationId: "unknown")
        XCTAssertNil(sut.load(for: "unknown"))
    }
}
