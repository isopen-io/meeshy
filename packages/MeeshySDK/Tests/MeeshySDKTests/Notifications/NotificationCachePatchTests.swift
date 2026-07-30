import XCTest
@testable import MeeshySDK

/// L'état « lu » d'une notification ne vivait QUE dans le tableau `@Published`
/// de la liste : le store GRDB gardait `isRead:false`. Comme
/// `NotificationListViewModel.loadInitial()` lit le cache d'abord et que la
/// fenêtre fraîche des notifications est de 2 minutes, rouvrir la cloche juste
/// après avoir tout lu re-servait l'instantané d'AVANT le marquage — les
/// notifications lues repartaient non lues.
///
/// `NotificationCachePatch` est la transformation pure appliquée au cache à
/// chaque marquage, quelle que soit la portée.
final class NotificationCachePatchTests: XCTestCase {

    private func makeNotification(
        id: String,
        isRead: Bool = false,
        conversationId: String? = nil,
        postId: String? = nil
    ) -> APINotification {
        APINotification(
            id: id,
            userId: "u1",
            type: "new_message",
            priority: nil,
            title: "Titre",
            subtitle: "Sous-titre",
            content: "Contenu",
            actor: nil,
            context: NotificationContext(conversationId: conversationId, postId: postId),
            metadata: nil,
            state: NotificationState(
                isRead: isRead,
                readAt: isRead ? "2026-07-31T10:00:00.000Z" : nil,
                createdAt: "2026-07-31T09:00:00.000Z",
                expiresAt: nil
            ),
            delivery: nil
        )
    }

    // MARK: - Portée : une notification

    func test_markingRead_singleNotification_marksOnlyThatOne() {
        let items = [
            makeNotification(id: "n1"),
            makeNotification(id: "n2")
        ]

        let result = NotificationCachePatch.markingRead(items, scope: .notification(id: "n1"))

        XCTAssertTrue(result[0].isRead)
        XCTAssertFalse(result[1].isRead)
    }

    // MARK: - Portée : conversation

    func test_markingRead_conversation_marksEveryRowOfThatConversation() {
        let items = [
            makeNotification(id: "n1", conversationId: "c1"),
            makeNotification(id: "n2", conversationId: "c1"),
            makeNotification(id: "n3", conversationId: "c2")
        ]

        let result = NotificationCachePatch.markingRead(items, scope: .conversation(id: "c1"))

        XCTAssertTrue(result[0].isRead)
        XCTAssertTrue(result[1].isRead)
        XCTAssertFalse(result[2].isRead, "une autre conversation ne doit pas être touchée")
    }

    // MARK: - Portée : post / story

    func test_markingRead_post_marksEveryRowOfThatPost() {
        let items = [
            makeNotification(id: "n1", postId: "p1"),
            makeNotification(id: "n2", postId: "p2"),
            makeNotification(id: "n3", conversationId: "c1")
        ]

        let result = NotificationCachePatch.markingRead(items, scope: .post(id: "p1"))

        XCTAssertTrue(result[0].isRead)
        XCTAssertFalse(result[1].isRead)
        XCTAssertFalse(result[2].isRead)
    }

    // MARK: - Portée : tout

    func test_markingRead_all_marksEverything() {
        let items = [
            makeNotification(id: "n1", conversationId: "c1"),
            makeNotification(id: "n2", postId: "p1"),
            makeNotification(id: "n3")
        ]

        let result = NotificationCachePatch.markingRead(items, scope: .all)

        XCTAssertTrue(result.allSatisfy(\.isRead))
    }

    // MARK: - Invariants

    func test_markingRead_preservesOrderAndCount() {
        let items = (1...5).map { makeNotification(id: "n\($0)", conversationId: "c1") }

        let result = NotificationCachePatch.markingRead(items, scope: .conversation(id: "c1"))

        XCTAssertEqual(result.map(\.id), items.map(\.id))
    }

    /// `withReadState` reconstruisait la notification sans reporter `title` /
    /// `subtitle` : une ligne lue perdait son cadrage « expéditeur + conversation »
    /// au round-trip cache.
    func test_markingRead_preservesTitleAndSubtitle() {
        let items = [makeNotification(id: "n1")]

        let result = NotificationCachePatch.markingRead(items, scope: .notification(id: "n1"))

        XCTAssertEqual(result[0].title, "Titre")
        XCTAssertEqual(result[0].subtitle, "Sous-titre")
    }

    func test_markingRead_keepsAlreadyReadRowsUntouched() {
        let items = [makeNotification(id: "n1", isRead: true, conversationId: "c1")]

        let result = NotificationCachePatch.markingRead(items, scope: .conversation(id: "c1"))

        XCTAssertTrue(result[0].isRead)
        XCTAssertEqual(result[0].readAt, "2026-07-31T10:00:00.000Z",
                       "un ré-marquage ne doit pas réécrire l'horodatage de lecture d'origine")
    }

    // MARK: - Suppression

    func test_removing_dropsOnlyTheTargetRow() {
        let items = [makeNotification(id: "n1"), makeNotification(id: "n2")]

        let result = NotificationCachePatch.removing(items, id: "n1")

        XCTAssertEqual(result.map(\.id), ["n2"])
    }
}
