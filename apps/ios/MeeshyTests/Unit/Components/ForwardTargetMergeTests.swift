import XCTest
@testable import Meeshy

@MainActor
final class ForwardTargetMergeTests: XCTestCase {
    private func conv(_ id: String, userId: String? = nil, title: String = "C") -> ForwardTarget {
        ForwardTarget(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }
    private func contact(_ userId: String, title: String = "P") -> ForwardTarget {
        ForwardTarget(id: "user:\(userId)", kind: .contact, conversationId: nil, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }

    func test_merge_keepsConversationsFirst() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c2")], contacts: [contact("u9")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "conv:c2", "user:u9"])
    }

    func test_merge_absorbsContactAlreadyInADirectConversation() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1", userId: "u1")], contacts: [contact("u1"), contact("u2")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "user:u2"],
                       "une personne déjà jointe par une conversation directe ne doit pas apparaître deux fois")
    }

    func test_merge_deduplicatesRepeatedConversations() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c1")], contacts: [])
        XCTAssertEqual(out.map(\.id), ["conv:c1"])
    }

    func test_merge_withoutUserId_neverAbsorbs() {
        let out = ForwardTargetMerge.merge(conversations: [conv("g1")], contacts: [contact("u1")])
        XCTAssertEqual(out.map(\.id), ["conv:g1", "user:u1"],
                       "un groupe n'absorbe personne — seule une conversation directe le peut")
    }
}
