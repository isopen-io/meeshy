import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **L'app remet ses destinataires à l'extension de partage** (#10947) : le
/// cliché `share_directory` de l'App Group porte les conversations de la liste
/// (chiffrée ou non, membres, pair d'une directe) et les personnes à qui écrire
/// (amis, carnet apparié), au nom du compte connecté — et part au logout.
@MainActor
final class ShareDirectoryPublisherTests: XCTestCase {

    private func makeSUT(owner: String?, people: [ShareRecipient] = []) throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.sharedirectory.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let sut = WidgetDataManager(
            suiteName: suite,
            stagingDirectories: [],
            shareDirectoryOwner: { owner },
            shareDirectoryPeople: { _ in people }
        )
        return (sut, defaults)
    }

    private func conversation(_ id: String, type: MeeshyConversation.ConversationType, encrypted: Bool = false) -> MeeshyConversation {
        var conversation = MeeshyConversation(id: id, identifier: id, type: type, title: id.capitalized)
        conversation.memberCount = 5
        conversation.encryptionMode = encrypted ? "e2ee" : nil
        return conversation
    }

    private func lea() -> ShareRecipient {
        ShareRecipient(id: "user:lea", kind: .person, conversationId: nil, userId: "lea", title: "Léa",
                       detail: .friendWithoutConversation, avatarURL: nil)
    }

    func test_publishShareDirectory_writesTheOwnersConversationsAndPeople() async throws {
        let (sut, defaults) = try makeSUT(owner: "me", people: [lea()])

        await sut.publishShareDirectory([conversation("g1", type: .group, encrypted: true), conversation("d1", type: .direct)])

        let snapshot = try XCTUnwrap(ShareDirectorySnapshot.decoded(from: defaults.data(forKey: ShareDirectorySnapshot.defaultsKey)))
        XCTAssertEqual(snapshot.ownerUserId, "me")
        XCTAssertEqual(snapshot.conversations.map(\.id), ["conv:g1", "conv:d1"])
        XCTAssertEqual(snapshot.conversations.first?.isEncrypted, true)
        XCTAssertEqual(snapshot.conversations.first?.detail, .group(members: 5))
        XCTAssertEqual(snapshot.people.map(\.id), ["user:lea"])
    }

    func test_publishShareDirectory_withoutAccount_writesNothing() async throws {
        let (sut, defaults) = try makeSUT(owner: nil, people: [lea()])

        await sut.publishShareDirectory([conversation("g1", type: .group)])

        XCTAssertNil(defaults.data(forKey: ShareDirectorySnapshot.defaultsKey))
    }

    func test_wipeAll_removesTheShareDirectory() async throws {
        let (sut, defaults) = try makeSUT(owner: "me")
        await sut.publishShareDirectory([conversation("g1", type: .group)])
        XCTAssertNotNil(defaults.data(forKey: ShareDirectorySnapshot.defaultsKey))

        sut.wipeAll()

        XCTAssertNil(defaults.data(forKey: ShareDirectorySnapshot.defaultsKey), "le cliché du compte sortant ne survit pas au logout")
    }

    func test_theSnapshot_isBounded() {
        let many = (0..<500).map { ShareRecipient(id: "conv:\($0)", kind: .conversation, conversationId: "\($0)", userId: nil, title: "\($0)", detail: .direct, avatarURL: nil) }
        let snapshot = ShareDirectorySnapshot.make(ownerUserId: "me", savedAt: Date(), conversations: many, people: many)
        XCTAssertEqual(snapshot.conversations.count, ShareDirectorySnapshot.maxConversations)
        XCTAssertEqual(snapshot.people.count, ShareDirectorySnapshot.maxPeople)
    }
}
