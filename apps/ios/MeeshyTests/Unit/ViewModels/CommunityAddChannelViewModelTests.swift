import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CommunityAddChannelViewModelTests: XCTestCase {

    private func conversation(id: String, communityId: String?) -> APIConversation {
        let community = communityId.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {"id":"\(id)","type":"group","identifier":"mshy_\(id)","title":"T-\(id)","communityId":\(community),"createdAt":"2026-10-01T10:00:00.000Z"}
        """)
    }

    private func makeSUT(
        _ items: [APIConversation],
        community: MockCommunityService = MockCommunityService(),
        onAdded: @escaping () -> Void = {}
    ) -> CommunityAddChannelViewModel {
        let conversations = MockConversationService()
        conversations.listResult = .success(CommunityStubs.page(items))
        return CommunityAddChannelViewModel(
            communityId: "c1",
            onAdded: onAdded,
            communityService: community,
            conversationService: conversations,
            currentUserId: { "u1" }
        )
    }

    func test_load_exclutLesConversationsDeLaCommunaute() async {
        let sut = makeSUT([conversation(id: "a", communityId: "c1"), conversation(id: "b", communityId: nil)])

        await sut.load()

        XCTAssertEqual(sut.conversations.map(\.id), ["b"])
        XCTAssertFalse(sut.isLoading)
    }

    func test_tap_conversationDUneAutreCommunaute_demandeConfirmation() async {
        let other = conversation(id: "x", communityId: "c2")
        let sut = makeSUT([other])
        await sut.load()

        sut.handleTap(other)

        XCTAssertTrue(sut.showMoveConfirm)
        XCTAssertEqual(sut.pendingMoveConversation?.id, "x")
    }

    func test_cancelMove_oubliLaConversationEnAttente() async {
        let other = conversation(id: "x", communityId: "c2")
        let sut = makeSUT([other])
        await sut.load()
        sut.handleTap(other)

        sut.cancelMove()

        XCTAssertNil(sut.pendingMoveConversation)
    }

    func test_tap_conversationLibre_ajouteSansConfirmation() async {
        let free = conversation(id: "f", communityId: nil)
        let community = MockCommunityService()
        let sut = makeSUT([free], community: community)
        await sut.load()

        sut.handleTap(free)
        for _ in 0..<50 where community.addConversationCallCount == 0 { await Task.yield() }

        XCTAssertFalse(sut.showMoveConfirm)
        XCTAssertEqual(community.addConversationCallCount, 1)
    }
}
