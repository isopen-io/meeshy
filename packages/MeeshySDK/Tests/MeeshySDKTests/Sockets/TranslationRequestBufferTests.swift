import XCTest
@testable import MeeshySDK

/// P2.1 — verifies the buffer behind ``MessageSocketManager.requestTranslation``
/// so user-triggered translation requests that arrive while the socket is
/// disconnected aren't silently dropped. The buffer is bounded (size + TTL)
/// and de-duplicates by (messageId, targetLanguage). The actual replay path
/// runs from the `.connect` handler and is exercised indirectly here through
/// the `flushBufferedTranslationRequests` test seam.
@MainActor
final class TranslationRequestBufferTests: XCTestCase {

    /// Cleans the buffer between cases — the manager is a singleton.
    override func tearDown() async throws {
        MessageSocketManager.shared.flushBufferedTranslationRequests(now: Date.distantFuture)
        try await super.tearDown()
    }

    func test_requestTranslation_whenDisconnected_buffersRequest() {
        let sut = MessageSocketManager.shared
        sut.flushBufferedTranslationRequests(now: Date.distantFuture)  // reset

        sut.requestTranslation(messageId: "msg-1", targetLanguage: "fr")

        let pending = sut.debug_pendingTranslationRequests
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.messageId, "msg-1")
        XCTAssertEqual(pending.first?.targetLanguage, "fr")
    }

    func test_requestTranslation_duplicateRequest_refreshesInsteadOfDuplicating() {
        let sut = MessageSocketManager.shared
        sut.flushBufferedTranslationRequests(now: Date.distantFuture)

        sut.requestTranslation(messageId: "msg-1", targetLanguage: "fr")
        sut.requestTranslation(messageId: "msg-1", targetLanguage: "fr")
        sut.requestTranslation(messageId: "msg-1", targetLanguage: "es")

        let pending = sut.debug_pendingTranslationRequests
        XCTAssertEqual(pending.count, 2, "Same (msg, lang) pair must collapse to one entry")
        XCTAssertEqual(Set(pending.map { $0.targetLanguage }), ["fr", "es"])
    }

    func test_flushBufferedTranslationRequests_dropsStaleEntries() {
        let sut = MessageSocketManager.shared
        sut.flushBufferedTranslationRequests(now: Date.distantFuture)

        // Stuff the buffer with a "stale" entry that predates the TTL window.
        sut.requestTranslation(messageId: "stale-msg", targetLanguage: "fr")

        let staleEntry = sut.debug_pendingTranslationRequests.first
        XCTAssertNotNil(staleEntry)

        let waaayLater = Date().addingTimeInterval(
            MessageSocketManager.translationBufferTTL + 5
        )
        sut.flushBufferedTranslationRequests(now: waaayLater)

        XCTAssertTrue(sut.debug_pendingTranslationRequests.isEmpty)
    }

    func test_buffer_capsAtMaxSize_droppingOldest() {
        let sut = MessageSocketManager.shared
        sut.flushBufferedTranslationRequests(now: Date.distantFuture)

        let overflow = MessageSocketManager.translationBufferMaxSize + 10
        for i in 0..<overflow {
            sut.requestTranslation(messageId: "msg-\(i)", targetLanguage: "fr")
        }

        let pending = sut.debug_pendingTranslationRequests
        XCTAssertEqual(pending.count, MessageSocketManager.translationBufferMaxSize)
        // Oldest dropped → the survivors are the last `maxSize` enqueued.
        let surviving = pending.map { $0.messageId }
        XCTAssertEqual(surviving.first, "msg-10")
        XCTAssertEqual(surviving.last, "msg-\(overflow - 1)")
    }
}
