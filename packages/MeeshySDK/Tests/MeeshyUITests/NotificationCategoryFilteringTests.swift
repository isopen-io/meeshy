import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// LA CLOCHE SE VIDE ET SES CATÉGORIES FILTRENT (#8958).
///
/// Trois lois : chaque type connu appartient à UNE catégorie ; une ligne lue
/// d'une famille consommable (message, réaction, mention, commentaire) ne
/// s'affiche plus ; une catégorie se demande à la PASSERELLE, page après page,
/// au lieu de trier les trente lignes déjà chargées.
///
/// `@MainActor` : `NotificationCategory` vit dans MeeshyUI, isolé sur le
/// MainActor par défaut (son libellé lit `Bundle.module`, isolé lui aussi).
@MainActor
final class NotificationCategoryFilteringTests: XCTestCase {

    private final class MockNotificationService: NotificationServiceProviding, @unchecked Sendable {
        struct Appel: Equatable {
            let unreadOnly: Bool
            let types: [String]
            let hideReadTypes: [String]
            let cursor: String?
        }

        var pages: [NotificationListResponse] = []
        private(set) var appels: [Appel] = []

        func list(
            offset: Int?,
            cursor: String?,
            limit: Int,
            unreadOnly: Bool,
            types: [String],
            hideReadTypes: [String]
        ) async throws -> NotificationListResponse {
            appels.append(Appel(unreadOnly: unreadOnly, types: types, hideReadTypes: hideReadTypes, cursor: cursor))
            guard !pages.isEmpty else { throw URLError(.badServerResponse) }
            return pages.removeFirst()
        }

        func unreadCount() async throws -> Int { 0 }
        func markAsRead(notificationId: String) async throws {}
    }

    private func notification(_ id: String, type: MeeshyNotificationType, isRead: Bool = false) -> APINotification {
        APINotification(
            id: id, userId: "u1", type: type.rawValue, priority: nil,
            content: "n", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: isRead, readAt: nil, createdAt: "2026-09-30T00:00:00.000Z", expiresAt: nil),
            delivery: nil
        )
    }

    private func page(_ rows: [APINotification], hasMore: Bool = false, nextCursor: String? = nil) -> NotificationListResponse {
        NotificationListResponse(
            success: true,
            data: rows,
            pagination: NotificationPagination(total: nil, offset: nil, limit: 30, hasMore: hasMore, nextCursor: nextCursor),
            unreadCount: nil
        )
    }

    private var families: [NotificationCategory] {
        NotificationCategory.allCases.filter { $0 != .all && $0 != .unread }
    }

    // MARK: - Chaque type a sa catégorie

    func test_chaqueTypeConnu_appartientAUneSeuleCategorie() {
        for type in MeeshyNotificationType.allCases {
            let owners = families.filter { $0.matchingTypes.contains(type) }
            XCTAssertEqual(owners.count, 1, "\(type.rawValue) est rangé sous \(owners.map(\.rawValue))")
        }
    }

    func test_lesPaliers_ontLeurCategorieEngagements_etQuittentSysteme() {
        for type: MeeshyNotificationType in [.achievementUnlocked, .streakMilestone, .levelUp, .badgeEarned] {
            XCTAssertTrue(NotificationCategory.engagement.matchingTypes.contains(type))
            XCTAssertFalse(NotificationCategory.system.matchingTypes.contains(type))
        }
    }

    func test_lesTypesQueLeWebRangeaitSeul_ontEnfinLeurCategorie() {
        XCTAssertTrue(NotificationCategory.reactions.matchingTypes.contains(.commentReaction))
        XCTAssertTrue(NotificationCategory.social.matchingTypes.contains(.storyNewComment))
        XCTAssertTrue(NotificationCategory.social.matchingTypes.contains(.friendNewStory))
        XCTAssertTrue(NotificationCategory.groups.matchingTypes.contains(.newConversationGroup))
    }

    // MARK: - Une notification consommée quitte la cloche

    func test_uneLigneLueDeMessageReactionOuCommentaire_nesAfficheNulle_part() {
        let consumed = [
            notification("m", type: .newMessage, isRead: true),
            notification("r", type: .messageReaction, isRead: true),
            notification("c", type: .postComment, isRead: true),
            notification("@", type: .userMentioned, isRead: true),
        ]
        for category in NotificationCategory.allCases {
            XCTAssertTrue(consumed.filter(category.accepts).isEmpty, "\(category.rawValue) affiche une ligne consommée")
        }
    }

    func test_uneLigneLueQuiSeRelit_reste() {
        let friendRequest = notification("f", type: .friendRequest, isRead: true)
        let badge = notification("b", type: .badgeEarned, isRead: true)

        XCTAssertTrue(NotificationCategory.all.accepts(friendRequest))
        XCTAssertTrue(NotificationCategory.contacts.accepts(friendRequest))
        XCTAssertTrue(NotificationCategory.engagement.accepts(badge))
    }

    func test_uneLigneNonLue_resteDansSaCategorie_etSeulementLa() {
        let message = notification("m", type: .newMessage)

        XCTAssertTrue(NotificationCategory.messages.accepts(message))
        XCTAssertTrue(NotificationCategory.unread.accepts(message))
        XCTAssertFalse(NotificationCategory.reactions.accepts(message))
    }

    // MARK: - La requête de chaque catégorie

    func test_toutes_demandeALaPasserelleDeRetirerLesLignesConsommees() {
        let query = NotificationCategory.all.serverQuery

        XCTAssertEqual(query.types, [])
        XCTAssertFalse(query.unreadOnly)
        XCTAssertTrue(query.hideReadTypes.contains("new_message"))
        XCTAssertTrue(query.hideReadTypes.contains("post_comment"))
        XCTAssertFalse(query.hideReadTypes.contains("friend_request"))
    }

    func test_uneFamille_demandeSesTypes_triés() {
        let query = NotificationCategory.mentions.serverQuery

        XCTAssertEqual(query.types, ["MENTION", "mention", "user_mentioned"].sorted())
        XCTAssertEqual(query.hideReadTypes, query.types)
    }

    func test_uneFamilleQuiSeRelit_neRetireRien() {
        XCTAssertEqual(NotificationCategory.contacts.serverQuery.hideReadTypes, [])
    }

    func test_nonLues_demandeUnreadOnly() {
        XCTAssertTrue(NotificationCategory.unread.serverQuery.unreadOnly)
    }

    // MARK: - Le ViewModel demande la catégorie à la passerelle

    @MainActor
    func test_select_chargeLaPageServeurDeLaCategorie() async {
        let mock = MockNotificationService()
        mock.pages = [page([notification("men", type: .userMentioned)], hasMore: true, nextCursor: "ancre")]
        let vm = NotificationListViewModel(service: mock)

        await vm.select(.mentions)

        XCTAssertEqual(mock.appels.last?.types, NotificationCategory.mentions.serverQuery.types)
        XCTAssertEqual(vm.filteredNotifications.map(\.id), ["men"])
        XCTAssertTrue(vm.hasMore)
    }

    @MainActor
    func test_loadMore_sousUneCategorie_garderSesTypes_etSonAncre() async {
        let mock = MockNotificationService()
        mock.pages = [
            page([notification("m1", type: .newMessage)], hasMore: true, nextCursor: "ancre-m1"),
            page([notification("m2", type: .newMessage)]),
        ]
        let vm = NotificationListViewModel(service: mock)

        await vm.select(.messages)
        await vm.loadMore()

        XCTAssertEqual(mock.appels.count, 2)
        XCTAssertEqual(mock.appels[1].types, NotificationCategory.messages.serverQuery.types)
        XCTAssertEqual(mock.appels[1].cursor, "ancre-m1")
        XCTAssertEqual(vm.filteredNotifications.map(\.id), ["m1", "m2"])
    }

    @MainActor
    func test_select_laMemeCategorie_neRechargePas() async {
        let mock = MockNotificationService()
        let vm = NotificationListViewModel(service: mock)

        await vm.select(.all)

        XCTAssertTrue(mock.appels.isEmpty)
    }
}
