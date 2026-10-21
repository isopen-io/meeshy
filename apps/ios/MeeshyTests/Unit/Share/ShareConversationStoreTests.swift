import XCTest

/// Les fixtures reproduisent EXACTEMENT ce que `WidgetDataManager` sérialise
/// dans l'App Group (`recent_conversations` = `[WidgetConversation]`,
/// `conversation_snapshots` = `[String: ConversationSnapshotPayload]`, encodeur
/// en `.iso8601`). Toute dérive du producteur casse ces tests — c'est le but :
/// la panne historique venait précisément d'une clé lue que personne n'écrivait.
final class ShareConversationStoreTests: XCTestCase {

    private func recents(_ entries: [(id: String, name: String, accent: String)]) -> Data {
        let rows = entries.map { entry in
            """
            {"id":"\(entry.id)","contactName":"\(entry.name)","contactAvatar":"person.circle.fill",\
            "lastMessage":"Salut","timestamp":"2026-07-29T10:00:00Z","isUnread":false,\
            "isPinned":false,"accentColor":"\(entry.accent)"}
            """
        }
        return Data("[\(rows.joined(separator: ","))]".utf8)
    }

    private func snapshot(id: String, customName: String?, unread: Int) -> String {
        let custom = customName.map { "\"\($0)\"" } ?? "null"
        return """
        "\(id)":{"id":"\(id)","type":"direct","title":"Titre serveur","customName":\(custom),\
        "isPinned":false,"isMuted":false,"isArchived":false,"isLocked":false,\
        "favoriteEmoji":null,"categoryName":null,"accentColor":"#111111","unreadCount":\(unread)}
        """
    }

    // MARK: - Cas nominal

    func test_targets_fromRecentsOnly_usesResolvedDisplayName() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Alice Martin", accent: "#AABBCC")]),
            snapshotsData: nil
        )

        XCTAssertEqual(targets.count, 1)
        XCTAssertEqual(targets.first?.id, "c1")
        XCTAssertEqual(targets.first?.displayName, "Alice Martin")
        XCTAssertEqual(targets.first?.accentColorHex, "#AABBCC")
        XCTAssertEqual(targets.first?.unreadCount, 0)
    }

    func test_targets_preservesRecentsOrdering() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([
                (id: "c1", name: "Un", accent: "#111111"),
                (id: "c2", name: "Deux", accent: "#222222"),
                (id: "c3", name: "Trois", accent: "#333333")
            ]),
            snapshotsData: nil
        )

        XCTAssertEqual(targets.map(\.id), ["c1", "c2", "c3"])
    }

    // MARK: - Enrichissement par les snapshots

    /// Le renommage LOCAL prime sur le nom canonique — même règle que
    /// `WidgetDataManager.conversationToastPresentation`.
    func test_targets_customNameOverridesContactName() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Alice Martin", accent: "#AABBCC")]),
            snapshotsData: Data("{\(snapshot(id: "c1", customName: "Alice ❤️", unread: 3))}".utf8)
        )

        XCTAssertEqual(targets.first?.displayName, "Alice ❤️")
        XCTAssertEqual(targets.first?.unreadCount, 3)
    }

    func test_targets_blankCustomName_fallsBackToContactName() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Alice Martin", accent: "#AABBCC")]),
            snapshotsData: Data("{\(snapshot(id: "c1", customName: "   ", unread: 0))}".utf8)
        )

        XCTAssertEqual(targets.first?.displayName, "Alice Martin")
    }

    /// Les snapshots ne sont QU'un enrichissement : ils ne peuvent pas ajouter
    /// une conversation à la liste. `ConversationSnapshotPayload.title` porte
    /// `conv.title` brut, `nil` pour une conversation directe — une entrée
    /// venue de là s'afficherait sans nom.
    func test_targets_snapshotWithoutMatchingRecent_isNotListed() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Alice", accent: "#AABBCC")]),
            snapshotsData: Data("{\(snapshot(id: "orpheline", customName: "Fantôme", unread: 9))}".utf8)
        )

        XCTAssertEqual(targets.map(\.id), ["c1"])
    }

    // MARK: - Dégradations

    /// Aucun repli fabriqué : une lecture cassée produit une liste VIDE, jamais
    /// des contacts d'exemple. C'est la correction de la cause racine.
    func test_targets_withoutRecents_returnsEmpty() {
        XCTAssertTrue(ShareConversationStore.targets(recentsData: nil, snapshotsData: nil).isEmpty)
    }

    func test_targets_withCorruptRecents_returnsEmpty() {
        XCTAssertTrue(ShareConversationStore.targets(
            recentsData: Data("pas du json".utf8),
            snapshotsData: nil
        ).isEmpty)
    }

    /// Des snapshots illisibles ne doivent pas emporter la liste : on dégrade
    /// sur les noms canoniques plutôt que de ne rien afficher.
    func test_targets_withCorruptSnapshots_stillReturnsRecents() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Alice", accent: "#AABBCC")]),
            snapshotsData: Data("{{{".utf8)
        )

        XCTAssertEqual(targets.map(\.displayName), ["Alice"])
        XCTAssertEqual(targets.first?.unreadCount, 0)
    }

    func test_targets_withEmptyRecentsArray_returnsEmpty() {
        XCTAssertTrue(ShareConversationStore.targets(
            recentsData: Data("[]".utf8),
            snapshotsData: nil
        ).isEmpty)
    }

    // MARK: - Initiales

    // MARK: - Le genre de la conversation (#10947)

    func test_targets_aGroupSnapshot_marksTheTargetAsAGroup() {
        let group = snapshot(id: "g1", customName: nil, unread: 0).replacingOccurrences(of: "\"type\":\"direct\"", with: "\"type\":\"group\"")
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "g1", name: "Équipe Lyon", accent: "#AABBCC"), (id: "d1", name: "Ana", accent: "#AABBCC")]),
            snapshotsData: Data("{\(group),\(snapshot(id: "d1", customName: nil, unread: 0))}".utf8)
        )

        XCTAssertEqual(targets.map(\.isGroup), [true, false])
    }

    func test_targets_withoutSnapshot_isNotAssumedToBeAGroup() {
        let targets = ShareConversationStore.targets(
            recentsData: recents([(id: "c1", name: "Ana", accent: "#AABBCC")]),
            snapshotsData: nil
        )
        XCTAssertEqual(targets.first?.isGroup, false)
    }
}
