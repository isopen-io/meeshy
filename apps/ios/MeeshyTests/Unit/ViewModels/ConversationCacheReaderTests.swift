import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationCacheReaderTests: XCTestCase {

    private func makeConversation(id: String) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: "id-\(id)", type: .direct)
    }

    private func makeMessage(id: String) -> Message {
        Message(id: id, conversationId: "conv-1", content: "x")
    }

    func test_currentConversation_returnsMatchFromFreshOrStaleList_nilOnExpiredOrEmpty() async {
        let list = [makeConversation(id: "c1"), makeConversation(id: "c2")]
        let fresh = ConversationCacheReader(loadConversations: { .fresh(list, age: 1) })
        let stale = ConversationCacheReader(loadConversations: { .stale(list, age: 900) })
        let expired = ConversationCacheReader(loadConversations: { .expired })
        let empty = ConversationCacheReader(loadConversations: { .empty })

        let fromFresh = await fresh.currentConversation(id: "c2")
        let fromStale = await stale.currentConversation(id: "c1")
        let missing = await fresh.currentConversation(id: "nope")
        let fromExpired = await expired.currentConversation(id: "c1")
        let fromEmpty = await empty.currentConversation(id: "c1")

        XCTAssertEqual(fromFresh?.id, "c2")
        XCTAssertEqual(fromStale?.id, "c1")
        XCTAssertNil(missing)
        XCTAssertNil(fromExpired)
        XCTAssertNil(fromEmpty)
    }

    func test_cachedThread_returnsDataOnFreshOrStale_nilOtherwise() async {
        let thread = [makeMessage(id: "m1")]
        let asked = AskedIds()
        let fresh = ConversationCacheReader(loadThread: { id in asked.ids.append(id); return .fresh(thread, age: 1) })
        let stale = ConversationCacheReader(loadThread: { _ in .stale(thread, age: 900) })
        let expired = ConversationCacheReader(loadThread: { _ in .expired })
        let empty = ConversationCacheReader(loadThread: { _ in .empty })

        let fromFresh = await fresh.cachedThread(id: "conv-1")
        let fromStale = await stale.cachedThread(id: "conv-1")
        let fromExpired = await expired.cachedThread(id: "conv-1")
        let fromEmpty = await empty.cachedThread(id: "conv-1")

        XCTAssertEqual(fromFresh?.map(\.id), ["m1"])
        XCTAssertEqual(fromStale?.map(\.id), ["m1"])
        XCTAssertNil(fromExpired)
        XCTAssertNil(fromEmpty)
        XCTAssertEqual(asked.ids, ["conv-1"])
    }

    private final class AskedIds {
        var ids: [String] = []
    }
}
