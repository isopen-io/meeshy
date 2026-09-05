import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// LA BOUCLE DU CURSEUR, AU NIVEAU DU VIEWMODEL (#4901).
///
/// `NotificationCursorPaginationTests` prouve le SERVICE (l'ancre voyage, le
/// rang reste formulable) ; ces témoins prouvent la BOUCLE — que la cloche
/// EMPRUNTE l'ancre que la page précédente a servie, page après page, et
/// s'arrête quand le serveur dit stop. Le mock CAPTURE les arguments de
/// chaque appel : l'état privé du VM (`nextCursor`) ne se lit pas, il
/// s'OBSERVE par ce qu'il fait partir sur le réseau — un mock qui ignorerait
/// le `where` ne testerait pas la requête.
final class NotificationListViewModelPaginationTests: XCTestCase {

    private final class MockNotificationService: NotificationServiceProviding, @unchecked Sendable {
        struct Appel: Equatable {
            let offset: Int?
            let cursor: String?
            let limit: Int
            let unreadOnly: Bool
        }

        var pages: [NotificationListResponse] = []
        private(set) var appels: [Appel] = []

        func list(
            offset: Int?,
            cursor: String?,
            limit: Int,
            unreadOnly: Bool
        ) async throws -> NotificationListResponse {
            appels.append(Appel(offset: offset, cursor: cursor, limit: limit, unreadOnly: unreadOnly))
            guard !pages.isEmpty else { throw URLError(.badServerResponse) }
            return pages.removeFirst()
        }

        func unreadCount() async throws -> Int { 0 }
        func markAsRead(notificationId: String) async throws {}
    }

    private func notification(_ id: String) -> APINotification {
        APINotification(
            id: id, userId: "u1", type: "message", priority: nil,
            content: "n", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: false, readAt: nil, createdAt: "2026-09-01T00:00:00.000Z", expiresAt: nil),
            delivery: nil
        )
    }

    private func page(
        _ ids: [String],
        hasMore: Bool,
        nextCursor: String?
    ) -> NotificationListResponse {
        NotificationListResponse(
            success: true,
            data: ids.map(notification),
            pagination: NotificationPagination(
                total: nil, offset: nil, limit: 30, hasMore: hasMore, nextCursor: nextCursor
            ),
            unreadCount: nil
        )
    }

    @MainActor
    func test_loadMore_empruntesLAncreServie_pageApresPage_etSarreteAuStop() async {
        let mock = MockNotificationService()
        mock.pages = [
            page(["n1", "n2"], hasMore: true, nextCursor: "ancre-n2"),
            page(["n3"], hasMore: false, nextCursor: "ancre-n3"),
        ]
        let vm = NotificationListViewModel(service: mock)
        vm.hasMore = true

        await vm.loadMore()
        await vm.loadMore()
        // Le serveur a dit stop (`hasMore: false`) : plus AUCUN appel ne part.
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        // Premier appel : ni rang ni curseur encore servis — le rang 0 du
        // démarrage (le repli), jamais une ancre inventée.
        XCTAssertEqual(mock.appels[0].cursor, nil)
        // Deuxième appel : l'ancre de la page 1, VERBATIM, et aucun rang à
        // côté — le curseur GAGNE.
        XCTAssertEqual(mock.appels[1].cursor, "ancre-n2")
        XCTAssertEqual(mock.appels[1].offset, nil)
        XCTAssertEqual(vm.notifications.map(\.id), ["n1", "n2", "n3"])
        XCTAssertFalse(vm.hasMore)
    }

    @MainActor
    func test_loadMore_sansAncreServie_resteAuRang_leRepliDuGatewayAnterieur() async {
        let mock = MockNotificationService()
        mock.pages = [
            page(["n1", "n2"], hasMore: true, nextCursor: nil),
            page(["n3"], hasMore: false, nextCursor: nil),
        ]
        let vm = NotificationListViewModel(service: mock)
        vm.hasMore = true

        await vm.loadMore()
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        XCTAssertEqual(mock.appels[1].cursor, nil)
        // Le rang suit ce que la cloche a déjà : 2 lignes — la forme sujette
        // au doublon sous insertion, gardée UNIQUEMENT pour un gateway
        // antérieur (dimension 9), jamais le défaut.
        XCTAssertEqual(mock.appels[1].offset, 2)
    }

    @MainActor
    func test_uneErreurRéseau_neCasseNiLaListe_niLaReprise() async {
        let mock = MockNotificationService()
        mock.pages = []
        let vm = NotificationListViewModel(service: mock)
        vm.hasMore = true

        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 1)
        XCTAssertEqual(vm.notifications, [])
        // L'échec laisse `hasMore` en place : le prochain défilement réessaie.
        XCTAssertTrue(vm.hasMore)
    }
}
