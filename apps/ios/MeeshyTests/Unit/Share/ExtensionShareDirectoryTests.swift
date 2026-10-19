import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Les destinataires de l'extension de partage** (#10947) — le cliché de l'app
/// d'abord, les récents du widget à défaut, le serveur ensuite ; rien d'un autre
/// compte, rien sans session.
final class ExtensionShareDirectoryTests: XCTestCase {

    private let session = ShareSession(userId: "me", token: "jwt", apiBaseURL: "https://gate.staging.meeshy.me")

    private func defaults() -> UserDefaults {
        let suite = "share-directory-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func recipient(_ id: String, encrypted: Bool = false) -> ShareRecipient {
        ShareRecipient(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: nil, title: id.capitalized,
                       detail: .group(members: 4), avatarURL: "https://cdn/\(id).jpg", isEncrypted: encrypted)
    }

    private func person(_ id: String) -> ShareRecipient {
        ShareRecipient(id: "user:\(id)", kind: .person, conversationId: nil, userId: id, title: id.capitalized,
                       detail: .friendWithoutConversation, avatarURL: nil)
    }

    private func store(_ snapshot: ShareDirectorySnapshot, in defaults: UserDefaults) {
        defaults.set(snapshot.encoded(), forKey: ShareDirectorySnapshot.defaultsKey)
    }

    private func sut(_ defaults: UserDefaults, session: ShareSession?, fetch: @escaping @concurrent @Sendable (URLRequest) async throws -> (Data, URLResponse) = { _ in throw URLError(.notConnectedToInternet) }) -> ExtensionShareDirectory {
        nonisolated(unsafe) let shared = defaults
        return ExtensionShareDirectory(session: session, readDefaults: { shared }, fetch: fetch)
    }

    func test_theAppSnapshot_servesItsOwner_conversationsAndPeople() async {
        let defaults = defaults()
        store(.make(ownerUserId: "me", savedAt: Date(), conversations: [recipient("c1", encrypted: true)], people: [person("lea"), person("me")]), in: defaults)
        let directory = sut(defaults, session: session)

        let conversations = await directory.cachedConversations()
        let people = await directory.cachedPeople(currentUserId: "me")

        XCTAssertEqual(conversations.map(\.id), ["conv:c1"])
        XCTAssertEqual(conversations.first?.isEncrypted, true, "le cliché dit le chiffrement (D7)")
        XCTAssertEqual(conversations.first?.avatarURL, "https://cdn/c1.jpg")
        XCTAssertEqual(people.map(\.id), ["user:lea"], "on ne s'écrit pas à soi-même")
    }

    func test_anotherAccountsSnapshot_isNeverShown() async {
        let defaults = defaults()
        store(.make(ownerUserId: "someone-else", savedAt: Date(), conversations: [recipient("c1")], people: [person("lea")]), in: defaults)
        let directory = sut(defaults, session: session)

        let conversations = await directory.cachedConversations()
        let people = await directory.cachedPeople(currentUserId: "me")
        XCTAssertTrue(conversations.isEmpty)
        XCTAssertTrue(people.isEmpty)
    }

    func test_withoutSession_nothingIsListed() async {
        let defaults = defaults()
        store(.make(ownerUserId: "me", savedAt: Date(), conversations: [recipient("c1")], people: []), in: defaults)

        let conversations = await sut(defaults, session: nil).cachedConversations()
        XCTAssertTrue(conversations.isEmpty)
    }

    /// Juste après une mise à jour, l'app n'a pas encore déposé son cliché :
    /// les récents du widget servent de repli.
    func test_withoutSnapshot_theWidgetRecentsAreTheFallback() async {
        let defaults = defaults()
        let recents = ##"[{"id":"g1","contactName":"Équipe Lyon","contactAvatar":"person.3.fill","lastMessage":"","timestamp":"2026-10-19T10:00:00Z","isUnread":false,"isPinned":false,"accentColor":"#6366F1"}]"##
        let snapshots = ##"{"g1":{"id":"g1","type":"group","title":null,"customName":null,"isPinned":false,"isMuted":false,"isArchived":false,"isLocked":false,"favoriteEmoji":null,"categoryName":null,"accentColor":null,"unreadCount":0}}"##
        defaults.set(Data(recents.utf8), forKey: ShareConversationStore.recentConversationsKey)
        defaults.set(Data(snapshots.utf8), forKey: ShareConversationStore.conversationSnapshotsKey)

        let conversations = await sut(defaults, session: session).cachedConversations()

        XCTAssertEqual(conversations.map(\.id), ["conv:g1"])
        XCTAssertEqual(conversations.first?.title, "Équipe Lyon")
        XCTAssertEqual(conversations.first?.isGroup, true)
        XCTAssertEqual(conversations.first?.isEncrypted, true,
                       "les récents du widget ne disent pas le chiffrement : inconnu vaut chiffré (fail-closed, #9224)")
    }

    func test_freshConversations_readTheServerWithTheSessionToken() async throws {
        let body = #"{"success":true,"data":[{"id":"6a0000000000000000000001","type":"group","title":"Projet Dakar","isActive":true,"memberCount":4,"encryptionMode":"e2ee","createdAt":"2026-10-19T10:00:00.000Z"}]}"#
        let directory = sut(defaults(), session: session) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt")
            XCTAssertEqual(request.url?.host, "gate.staging.meeshy.me")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }

        let fresh = try await directory.freshConversations(currentUserId: "me")

        XCTAssertEqual(fresh.map(\.id), ["conv:6a0000000000000000000001"])
        XCTAssertEqual(fresh.first?.isEncrypted, true)
    }

    func test_freshConversations_withoutSession_throws_soTheCacheStays() async {
        do {
            _ = try await sut(defaults(), session: nil).freshConversations(currentUserId: "")
            XCTFail("sans session, rien n'est revalidé")
        } catch {}
    }
}
