import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// LA CLOCHE SE VIDE ET SES CATÉGORIES FILTRENT (#8958).
///
/// Trois lois : chaque type connu appartient à UNE catégorie ; une ligne lue
/// d'une famille consommable (message, réaction, mention, commentaire) ne
/// s'affiche plus ; une catégorie se demande à la PASSERELLE, page après page,
/// au lieu de trier les trente lignes déjà chargées.
@MainActor
final class NotificationCategoryFilteringTests: XCTestCase {

    private func notification(_ id: String, type: MeeshyNotificationType, isRead: Bool = false) -> APINotification {
        APINotification(
            id: id, userId: "u1", type: type.rawValue, priority: nil,
            content: "n", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: isRead, readAt: nil, createdAt: "2026-09-30T00:00:00.000Z", expiresAt: nil),
            delivery: nil
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
}
