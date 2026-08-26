import XCTest
import Combine
@testable import MeeshySDK

/// Un prédicat de masse reçu d'un AUTRE appareil doit atteindre les vues
/// MONTÉES, pas seulement le cache durable : `NotificationListView` sert son
/// tableau depuis sa propre copie mémoire et n'écoute que les subjects du
/// manager. Un correctif qui n'écrirait que le cache serait invisible jusqu'au
/// prochain chargement — corrigé pour personne.
///
/// La republication réutilise les canaux du geste LOCAL équivalent : aucun
/// abonné neuf à câbler.
@MainActor
final class NotificationBulkRepublicationTests: XCTestCase {

    private func makeReadBulk(_ payload: NotificationBulkScopePayload) -> NotificationReadBulkEvent {
        NotificationReadBulkEvent(scope: payload)
    }

    func test_handleNotificationReadBulk_conversationScope_republishesOnConversationSubject() {
        var received: [String] = []
        let cancellable = NotificationToastManager.shared.conversationNotificationsRead.sink { received.append($0) }

        NotificationToastManager.shared.handleNotificationReadBulk(
            makeReadBulk(NotificationBulkScopePayload(kind: "context", contextKey: "conversationId", contextValue: "c-42"))
        )

        XCTAssertEqual(received, ["c-42"])
        cancellable.cancel()
    }

    func test_handleNotificationReadBulk_postScope_republishesOnPostSubject() {
        var received: [String] = []
        let cancellable = NotificationToastManager.shared.postNotificationsRead.sink { received.append($0) }

        NotificationToastManager.shared.handleNotificationReadBulk(
            makeReadBulk(NotificationBulkScopePayload(kind: "context", contextKey: "postId", contextValue: "p-7"))
        )

        XCTAssertEqual(received, ["p-7"])
        cancellable.cancel()
    }

    func test_handleNotificationReadBulk_typesScope_republishesOnTypeSubject() {
        var received: [[String]] = []
        let cancellable = NotificationToastManager.shared.typeNotificationsRead.sink { received.append($0) }

        NotificationToastManager.shared.handleNotificationReadBulk(
            makeReadBulk(NotificationBulkScopePayload(kind: "types", types: ["friend_request", "contact_request"]))
        )

        XCTAssertEqual(received, [["friend_request", "contact_request"]])
        cancellable.cancel()
    }

    func test_handleNotificationReadBulk_untranslatableScope_republishesNothing() {
        var conversations: [String] = []
        var posts: [String] = []
        var types: [[String]] = []
        var singles: [String] = []
        var cancellables: [AnyCancellable] = [
            NotificationToastManager.shared.conversationNotificationsRead.sink { conversations.append($0) },
            NotificationToastManager.shared.postNotificationsRead.sink { posts.append($0) },
            NotificationToastManager.shared.typeNotificationsRead.sink { types.append($0) },
            NotificationToastManager.shared.notificationMarkedRead.sink { singles.append($0) }
        ]

        NotificationToastManager.shared.handleNotificationReadBulk(
            makeReadBulk(NotificationBulkScopePayload(kind: "context", contextKey: "friendRequestId", contextValue: "fr-1"))
        )

        XCTAssertTrue(
            conversations.isEmpty && posts.isEmpty && types.isEmpty && singles.isEmpty,
            "Une portée non traduisible ne doit emprunter AUCUN canal de repli : la faire passer par " +
            "`.types([...])` marquerait lues les lignes d'une autre demande"
        )
        cancellables.removeAll()
    }

    func test_handleNotificationReadBulk_allScope_republishesNoPartialScope() {
        var conversations: [String] = []
        var posts: [String] = []
        var types: [[String]] = []
        var cancellables: [AnyCancellable] = [
            NotificationToastManager.shared.conversationNotificationsRead.sink { conversations.append($0) },
            NotificationToastManager.shared.postNotificationsRead.sink { posts.append($0) },
            NotificationToastManager.shared.typeNotificationsRead.sink { types.append($0) }
        ]

        NotificationToastManager.shared.handleNotificationReadBulk(
            makeReadBulk(NotificationBulkScopePayload(kind: "all"))
        )

        XCTAssertTrue(
            conversations.isEmpty && posts.isEmpty && types.isEmpty,
            "« Tout lire » n'a pas de canal partiel : le geste LOCAL équivalent (`markAllAsRead()`) n'en émet " +
            "aucun non plus, la liste se recalant sur le cache patché"
        )
        cancellables.removeAll()
    }
}
