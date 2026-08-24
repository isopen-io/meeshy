import XCTest
import MeeshySDK
@testable import Meeshy

/// Trois routes de gestion de membre — changer le rang, retirer, bannir — sont
/// adressées par `User.id`. Le trombinoscope leur passait `participant.id`, un
/// `Participant.id`, et les deux se ressemblent : ce sont deux ObjectId de
/// 24 caractères hexadécimaux, dans un modèle qui porte les deux côte à côte.
///
/// Ce que ça coûtait, et les deux moitiés n'ont pas le même prix :
///
/// - promouvoir répondait **404 « Participant not found »** — visible, donc au
///   moins signalé à l'utilisateur ;
/// - retirer répondait **200 sans avoir rien fait** : le gateway filtre par
///   `updateMany`, qui ne trouve aucune ligne et n'échoue pas. L'interface
///   retirait la personne de la liste, aucune diffusion ne partait, et le
///   prochain chargement la ramenait.
///
/// La quatrième route de la même famille — `/participants/:participantId/rights`,
/// pour les droits d'un visiteur SANS COMPTE — attend elle un `Participant.id`.
/// Les deux natures coexistent donc légitimement à un caractère près dans
/// l'URL ; seule une politique nommée peut dire laquelle va où.
/// `@MainActor` : `MemberActionPolicy` est compilé dans la cible app, dont
/// l'isolation par défaut est `MainActor` (`SWIFT_DEFAULT_ACTOR_ISOLATION`) ;
/// le bundle de tests, lui, compile en `nonisolated`. Sans cette annotation,
/// chaque appel — et chaque `XCTAssert` sur une propriété du résultat, ses
/// autoclosures comprises — est refusé à la compilation. Convention du dépôt
/// (`apps/ios/CLAUDE.md`) : toute suite qui exerce du code `@MainActor` porte
/// l'annotation.
@MainActor
final class MemberActionPolicyTests: XCTestCase {

    private func participant(
        id: String = "60a1b5bfd2d830fdd1da9d96",
        userId: String? = "68f33afa8ae497b2054c84d7",
        role: String = "member"
    ) -> APIParticipant {
        APIParticipant(id: id, userId: userId, conversationRole: role)
    }

    // MARK: - L'identifiant servi

    func test_actions_forRegisteredMember_carryTheUserIdNotTheParticipantId() {
        let target = participant()

        let actions = MemberActionPolicy.actions(for: target, currentUserRole: .creator)

        XCTAssertFalse(actions.isEmpty)
        for action in actions {
            XCTAssertEqual(
                action.targetKey,
                "68f33afa8ae497b2054c84d7",
                "\(action.kind) doit viser le User.id — le Participant.id fait répondre 404, ou 200 sans effet"
            )
            XCTAssertNotEqual(action.targetKey, target.id)
        }
    }

    // MARK: - Le visiteur sans compte

    func test_actions_forParticipantWithoutAccount_offerExpelAndBan() {
        // Les routes de gestion résolvent désormais leur cible sous les DEUX
        // colonnes (`User.id` OU `Participant.id`) : un visiteur de lien partagé
        // est expulsable et bannissable comme n'importe qui.
        let anonymous = participant(userId: nil)

        let actions = MemberActionPolicy.actions(for: anonymous, currentUserRole: .creator)

        XCTAssertEqual(actions.filter { $0.kind == .expel }.count, 1)
        XCTAssertEqual(actions.filter { $0.kind == .ban }.count, 1)
    }

    func test_actions_forParticipantWithoutAccount_targetTheirParticipantId() {
        // Son `Participant.id` est sa SEULE identité — il n'a pas de `User.id`.
        let anonymous = participant(userId: nil)

        let actions = MemberActionPolicy.actions(for: anonymous, currentUserRole: .creator)

        XCTAssertFalse(actions.isEmpty)
        for action in actions {
            XCTAssertEqual(action.targetKey, "60a1b5bfd2d830fdd1da9d96")
        }
    }

    func test_actions_forParticipantWithoutAccount_offerNoRoleChange() {
        // Promouvoir un visiteur de passage n'a pas de sens produit, et la route
        // de rang reste adressée par `User.id` seul. Ses droits se pilotent par
        // `/participants/:participantId/rights`, qui est un autre écran.
        let anonymous = participant(userId: nil)

        let actions = MemberActionPolicy.actions(for: anonymous, currentUserRole: .creator)

        XCTAssertTrue(actions.allSatisfy { $0.kind.targetRole == nil })
    }

    // MARK: - La hiérarchie

    func test_actions_whenTargetOutranksCaller_areEmpty() {
        let admin = participant(role: "admin")

        XCTAssertTrue(MemberActionPolicy.actions(for: admin, currentUserRole: .member).isEmpty)
        XCTAssertTrue(MemberActionPolicy.actions(for: admin, currentUserRole: .moderator).isEmpty)
    }

    func test_actions_creatorOnMember_offersBothPromotions() {
        let actions = MemberActionPolicy.actions(for: participant(), currentUserRole: .creator)

        XCTAssertEqual(actions.filter { $0.kind == .promoteToAdmin }.count, 1)
        XCTAssertEqual(actions.filter { $0.kind == .promoteToModerator }.count, 1)
    }

    func test_actions_adminOnMember_cannotPromoteToAdmin() {
        // Seul le créateur fabrique un admin — un admin ne se clone pas.
        let actions = MemberActionPolicy.actions(for: participant(), currentUserRole: .admin)

        XCTAssertTrue(actions.allSatisfy { $0.kind != .promoteToAdmin })
        XCTAssertEqual(actions.filter { $0.kind == .promoteToModerator }.count, 1)
    }

    func test_actions_onModerator_offerDemotionNotPromotion() {
        let moderator = participant(role: "moderator")

        let actions = MemberActionPolicy.actions(for: moderator, currentUserRole: .creator)

        XCTAssertEqual(actions.filter { $0.kind == .demoteToMember }.count, 1)
        XCTAssertTrue(actions.allSatisfy { $0.kind != .promoteToModerator })
    }

    func test_actions_moderatorCannotBan() {
        // Bannir est réservé au rang admin et au-dessus, côté gateway comme ici.
        let actions = MemberActionPolicy.actions(for: participant(), currentUserRole: .moderator)

        XCTAssertTrue(actions.allSatisfy { $0.kind != .ban })
        XCTAssertEqual(actions.filter { $0.kind == .expel }.count, 1)
    }

    func test_actions_adminCanBan() {
        let actions = MemberActionPolicy.actions(for: participant(), currentUserRole: .admin)

        XCTAssertEqual(actions.filter { $0.kind == .ban }.count, 1)
    }

    // MARK: - Le rang cible se lit sur la conversation, pas sur la plateforme

    func test_targetRole_readsConversationRoleNotPlatformRole() {
        // `APIParticipant.role` porte le rôle PLATEFORME ('USER', 'ADMIN'…),
        // `conversationRole` le rang dans le fil. Les confondre donnerait à tout
        // administrateur de la plateforme un rang d'admin dans chaque groupe.
        let platformAdminButPlainMember = APIParticipant(
            id: "60a1b5bfd2d830fdd1da9d96",
            userId: "68f33afa8ae497b2054c84d7",
            role: "ADMIN",
            conversationRole: "member"
        )

        let actions = MemberActionPolicy.actions(
            for: platformAdminButPlainMember,
            currentUserRole: .creator
        )

        XCTAssertEqual(actions.filter { $0.kind == .promoteToModerator }.count, 1)
    }
}
