import XCTest
import UniformTypeIdentifiers
import MeeshySDK
@testable import Meeshy

final class BubbleDragSourceTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(_ id: String = "p1", name: String = "plage.jpg", isViewOnce: Bool = false,
                       isBlurred: Bool = false, isEncrypted: Bool = false) -> MessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "srv-\(id).jpg", originalName: name, mimeType: "image/jpeg",
                                fileUrl: "https://cdn.example/\(id).jpg",
                                isViewOnce: isViewOnce, isBlurred: isBlurred, isEncrypted: isEncrypted)
    }

    private func video(_ id: String = "v1") -> MessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "srv-\(id).mp4", originalName: "clip.mp4", mimeType: "video/mp4",
                                fileUrl: "https://cdn.example/\(id).mp4")
    }

    private func audio(_ id: String = "a1") -> MessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "\(id).m4a", mimeType: "audio/mp4", fileUrl: "https://cdn.example/\(id).m4a")
    }

    private func message(_ content: String = "", effects: MessageEffects = .none, expiresAt: Date? = nil,
                         attachments: [MessageAttachment] = [], isEncrypted: Bool = false) -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "u2", content: content, expiresAt: expiresAt,
                effects: effects, isEncrypted: isEncrypted, attachments: attachments)
    }

    // MARK: - Ce qui peut sortir

    func test_mayLeave_ordinaryMessage_isTrue() {
        XCTAssertTrue(BubbleDragPolicy.mayLeave(message("salut").exitOffer))
    }

    func test_mayLeave_viewOnceMessage_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message("x", effects: MessageEffects(flags: .viewOnce)).exitOffer))
    }

    func test_mayLeave_viewOncePiece_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message(attachments: [photo(isViewOnce: true)]).exitOffer))
    }

    func test_mayLeave_blurredMessage_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message("x", effects: MessageEffects(flags: .blurred)).exitOffer))
    }

    func test_mayLeave_blurredPiece_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message(attachments: [photo(isBlurred: true)]).exitOffer))
    }

    func test_mayLeave_timedEphemeral_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message("x", expiresAt: Date().addingTimeInterval(300)).exitOffer))
    }

    func test_mayLeave_afterReadFlame_isFalse() {
        let flame = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message("x", effects: flame).exitOffer))
    }

    func test_mayLeave_encryptedMessage_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message("x", isEncrypted: true).exitOffer))
    }

    func test_mayLeave_encryptedPiece_isFalse() {
        XCTAssertFalse(BubbleDragPolicy.mayLeave(message(attachments: [photo(isEncrypted: true)]).exitOffer))
    }

    // MARK: - La source

    func test_source_protectedMessage_isNil_evenWithServedText() {
        let sealed = message("secret", effects: MessageEffects(flags: .viewOnce))
        XCTAssertNil(BubbleDragPolicy.source(for: sealed, servedText: "secret"))
    }

    func test_source_textOnly_carriesTheSERVEDText_notTheOriginal() {
        let english = message("Hello")
        XCTAssertEqual(BubbleDragPolicy.source(for: english, servedText: "Bonjour"), .text("Bonjour"))
    }

    func test_source_textOnly_withoutServedText_fallsBackToTheContent() {
        XCTAssertEqual(BubbleDragPolicy.source(for: message("Hello"), servedText: nil), .text("Hello"))
    }

    func test_source_photoWithCaption_dragsTheFirstVisualPiece_withOriginalNameAndImageType() throws {
        let captioned = message("légende", attachments: [audio(), photo("p1", name: "plage.jpg"), photo("p2")])
        let source = try XCTUnwrap(BubbleDragPolicy.source(for: captioned, servedText: "légende"))
        guard case let .media(remoteURL, kind, name, type) = source else { return XCTFail("un média") }
        XCTAssertEqual(remoteURL, "https://cdn.example/p1.jpg")
        XCTAssertEqual(kind, .image)
        XCTAssertEqual(name, "plage.jpg")
        XCTAssertTrue(try XCTUnwrap(UTType(type)).conforms(to: .image))
    }

    func test_source_video_typeIsMovie() throws {
        let source = try XCTUnwrap(BubbleDragPolicy.source(for: message(attachments: [video()]), servedText: nil))
        guard case let .media(_, kind, _, type) = source else { return XCTFail("un média") }
        XCTAssertEqual(kind, .video)
        XCTAssertTrue(try XCTUnwrap(UTType(type)).conforms(to: .movie))
    }

    func test_source_audioOnly_isNil() {
        XCTAssertNil(BubbleDragPolicy.source(for: message(attachments: [audio()]), servedText: nil))
    }

    func test_source_emptyTextNoMedia_isNil() {
        XCTAssertNil(BubbleDragPolicy.source(for: message("  "), servedText: "  "))
    }

    // MARK: - Le fournisseur

    private final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func bump() { lock.lock(); value += 1; lock.unlock() }
        var count: Int { lock.lock(); defer { lock.unlock() }; return value }
    }

    private func load(_ provider: NSItemProvider, type: String) async -> (URL?, Error?) {
        await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                let copy = url.flatMap { source -> URL? in
                    let destination = FileManager.default.temporaryDirectory.appendingPathComponent("test-\(UUID().uuidString)-\(source.lastPathComponent)")
                    try? FileManager.default.copyItem(at: source, to: destination)
                    return destination
                }
                continuation.resume(returning: (copy, error))
            }
        }
    }

    func test_provider_mediaNotCached_failsWithoutNetwork() async {
        let calls = Calls()
        let provider = BubbleDragItemProvider.make(
            .media(remoteURL: "https://cdn.example/p1.jpg", kind: .image, suggestedName: "plage.jpg", typeIdentifier: "public.jpeg"),
            resolveCachedFile: { _, _ in calls.bump(); return nil }
        )
        let (url, error) = await load(provider, type: "public.jpeg")
        XCTAssertNil(url)
        XCTAssertNotNil(error)
        XCTAssertEqual(calls.count, 1)
    }

    func test_provider_cachedMedia_vendsACopyNamedLikeTheOriginal() async throws {
        let cached = FileManager.default.temporaryDirectory.appendingPathComponent("cache-\(UUID().uuidString).bin")
        try Data("pixels".utf8).write(to: cached)
        let provider = BubbleDragItemProvider.make(
            .media(remoteURL: "https://cdn.example/p1.jpg", kind: .image, suggestedName: "plage.jpg", typeIdentifier: "public.jpeg"),
            resolveCachedFile: { _, _ in cached }
        )
        let (url, error) = await load(provider, type: "public.jpeg")
        XCTAssertNil(error)
        let vended = try XCTUnwrap(url)
        XCTAssertTrue(vended.lastPathComponent.hasSuffix("plage.jpg"))
        XCTAssertEqual(try Data(contentsOf: vended), Data("pixels".utf8))
    }

    func test_provider_text_carriesTheString() async throws {
        let provider = BubbleDragItemProvider.make(.text("Bonjour"), resolveCachedFile: { _, _ in nil })
        XCTAssertTrue(provider.canLoadObject(ofClass: NSString.self))
    }
}
