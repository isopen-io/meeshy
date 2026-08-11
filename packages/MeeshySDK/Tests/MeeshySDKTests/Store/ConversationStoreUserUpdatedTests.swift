import XCTest
@testable import MeeshySDK

/// `user:updated` — le profil public d'un CONTACT a changé.
///
/// Le défaut fermé ici : la gateway diffusait l'événement à tous les contacts
/// depuis des mois, le web l'appliquait, et iOS n'avait AUCUN listener. Un
/// interlocuteur qui changeait d'avatar ou de nom restait figé sur la ligne de
/// liste, l'en-tête de conversation et le sélecteur de transfert jusqu'au
/// prochain refetch complet.
final class ConversationStoreUserUpdatedTests: XCTestCase {

    // MARK: - Décodage du payload

    private func decodeEvent(_ json: String) throws -> UserUpdatedEvent {
        try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    func test_decode_nameGroup_resolvesDisplayNameAndMarksGroup() throws {
        let event = try decodeEvent("""
        {"userId":"u-1","changes":{"displayName":"Bob Jones","firstName":"Bob","lastName":"Jones","username":"bob"}}
        """)
        XCTAssertTrue(event.hasNameGroup)
        XCTAssertEqual(event.resolvedDisplayName, "Bob Jones")
        XCTAssertEqual(event.username, "bob")
    }

    /// Le nom rendu retombe sur le handle quand `displayName` est EFFACÉ — et
    /// c'est précisément ce que `null` (vs clé absente) permet d'exprimer.
    func test_decode_clearedDisplayName_fallsBackToUsername() throws {
        let event = try decodeEvent("""
        {"userId":"u-1","changes":{"displayName":null,"firstName":null,"lastName":null,"username":"bob"}}
        """)
        XCTAssertEqual(event.resolvedDisplayName, "bob")
    }

    /// Sans le groupe, aucun nom ne peut être recomposé : un payload d'avatar
    /// seul ne doit pas prétendre en porter un.
    func test_decode_avatarOnly_carriesNoNameGroup() throws {
        let event = try decodeEvent("""
        {"userId":"u-1","changes":{"avatar":"https://cdn/a.png"}}
        """)
        XCTAssertFalse(event.hasNameGroup)
        XCTAssertNil(event.resolvedDisplayName)
        XCTAssertEqual(event.avatar, .replaced("https://cdn/a.png"))
        XCTAssertEqual(event.banner, .unchanged)
    }

    /// Clé absente ≠ clé à `null`. Les confondre laisserait l'ancienne photo
    /// en place après une suppression d'avatar.
    func test_decode_nullAvatar_isReplacedWithNilNotUnchanged() throws {
        let event = try decodeEvent("""
        {"userId":"u-1","changes":{"avatar":null}}
        """)
        XCTAssertEqual(event.avatar, .replaced(nil))
    }

    // MARK: - Application au store

    private func directConv(
        id: String = "conv-1",
        participantUserId: String? = "u-1",
        title: String? = "Alice Smith",
        username: String? = "alice",
        avatar: String? = "https://cdn/old-a.png",
        banner: String? = "https://cdn/old-b.png"
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct, title: title,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            participantUserId: participantUserId,
            participantUsername: username,
            participantAvatarURL: avatar,
            participantBanner: banner
        )
    }

    private func event(
        userId: String = "u-1",
        displayName: String? = nil,
        username: String? = nil,
        hasNameGroup: Bool = false,
        avatar: UserUpdatedEvent.OptionalMediaChange = .unchanged,
        banner: UserUpdatedEvent.OptionalMediaChange = .unchanged
    ) throws -> UserUpdatedEvent {
        var changes: [String] = []
        if hasNameGroup {
            changes.append("\"displayName\":\(displayName.map { "\"\($0)\"" } ?? "null")")
            changes.append("\"firstName\":null")
            changes.append("\"lastName\":null")
            changes.append("\"username\":\(username.map { "\"\($0)\"" } ?? "null")")
        }
        if case .replaced(let url) = avatar {
            changes.append("\"avatar\":\(url.map { "\"\($0)\"" } ?? "null")")
        }
        if case .replaced(let url) = banner {
            changes.append("\"banner\":\(url.map { "\"\($0)\"" } ?? "null")")
        }
        return try decodeEvent("{\"userId\":\"\(userId)\",\"changes\":{\(changes.joined(separator: ","))}}")
    }

    func test_merging_directConversationWithThatContact_patchesIdentity() throws {
        let merged = ConversationStore.merging(
            directConv(),
            withUserUpdate: try event(displayName: "Bob Jones", username: "bob", hasNameGroup: true,
                                      avatar: .replaced("https://cdn/new-a.png"),
                                      banner: .replaced("https://cdn/new-b.png"))
        )
        XCTAssertEqual(merged?.title, "Bob Jones")
        XCTAssertEqual(merged?.participantUsername, "bob")
        XCTAssertEqual(merged?.participantAvatarURL, "https://cdn/new-a.png")
        XCTAssertEqual(merged?.participantBanner, "https://cdn/new-b.png")
    }

    /// Dans un groupe, la ligne porte l'identité du GROUPE. Repeindre son
    /// titre avec le nom d'un membre serait pire que le défaut d'origine.
    func test_merging_groupConversation_isNeverTouched() throws {
        var group = directConv()
        group = MeeshyConversation(
            id: group.id, identifier: group.identifier, type: .group, title: "Les copains",
            lastMessageAt: group.lastMessageAt, createdAt: group.createdAt, updatedAt: group.updatedAt,
            participantUserId: "u-1", participantUsername: "alice"
        )
        let merged = ConversationStore.merging(
            group,
            withUserUpdate: try event(displayName: "Bob Jones", username: "bob", hasNameGroup: true)
        )
        XCTAssertNil(merged)
    }

    func test_merging_otherContact_isNeverTouched() throws {
        let merged = ConversationStore.merging(
            directConv(participantUserId: "u-2"),
            withUserUpdate: try event(userId: "u-1", displayName: "Bob", username: "bob", hasNameGroup: true)
        )
        XCTAssertNil(merged)
    }

    /// `.replaced(nil)` = photo RETIRÉE. Un `if let` sur la valeur aurait
    /// gardé l'ancienne image pour toujours.
    func test_merging_clearedAvatar_removesIt() throws {
        let merged = ConversationStore.merging(
            directConv(),
            withUserUpdate: try event(avatar: .replaced(nil))
        )
        XCTAssertNil(merged?.participantAvatarURL)
        // La bannière n'était pas dans le payload : elle ne bouge pas.
        XCTAssertEqual(merged?.participantBanner, "https://cdn/old-b.png")
    }

    /// Un changement d'avatar seul ne porte pas le groupe du nom — le titre
    /// doit rester intact plutôt que d'être écrasé par un `nil` recomposé.
    func test_merging_avatarOnly_leavesTitleIntact() throws {
        let merged = ConversationStore.merging(
            directConv(),
            withUserUpdate: try event(avatar: .replaced("https://cdn/new-a.png"))
        )
        XCTAssertEqual(merged?.title, "Alice Smith")
        XCTAssertEqual(merged?.participantUsername, "alice")
    }

    /// Un événement qui ne change rien ne doit pas republier la liste : le
    /// contrat de `merging` est « nil = rien à committer », comme son jumeau
    /// `merging(_:with:)`.
    func test_merging_identicalValues_returnsNil() throws {
        let merged = ConversationStore.merging(
            directConv(title: "Bob Jones", username: "bob"),
            withUserUpdate: try event(displayName: "Bob Jones", username: "bob", hasNameGroup: true)
        )
        XCTAssertNil(merged)
    }

    func test_applyUserUpdated_patchesOnlyTheMatchingDirectConversation() async throws {
        let store = ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(
                dbPath: NSTemporaryDirectory() + "user-updated-\(UUID().uuidString).sqlite"
            )
        )
        await store.hydrate(directConv(id: "conv-1", participantUserId: "u-1"))
        await store.hydrate(directConv(id: "conv-2", participantUserId: "u-2"))

        await store.applyUserUpdated(
            try event(displayName: "Bob Jones", username: "bob", hasNameGroup: true)
        )

        let patched = await store.conversation(id: "conv-1")
        let untouched = await store.conversation(id: "conv-2")
        XCTAssertEqual(patched?.title, "Bob Jones")
        XCTAssertEqual(untouched?.title, "Alice Smith")
    }
}
