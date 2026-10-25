import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le chiffrement ne s'active que par un rôle de plateforme ANALYST ou
/// au-dessus tant que l'E2EE n'est pas opérationnel (#12517, #12588).**
///
/// Miroir de `mayActivateConversationEncryption`
/// (`services/gateway/src/utils/encryption-activation-policy.ts`), qui fait
/// foi par son 403 : l'interface ne fait que ne pas PROPOSER ce que la
/// passerelle refuserait. Les autres membres voient l'état, jamais le bouton.
@MainActor
final class ConversationEncryptionActivationPolicyTests: XCTestCase {

    func test_mayActivate_platformAdministrators_granted() {
        for role in ["ADMIN", "BIGBOSS", "admin", "BigBoss"] {
            XCTAssertTrue(ConversationEncryptionActivationPolicy.mayActivate(platformRole: role), role)
        }
    }

    func test_mayActivate_platformStaffRolesAnyCase_granted() {
        for role in ["MODERATOR", "moderator", "Moderator", "AUDIT", "audit", "Audit", "ANALYST", "analyst", "Analyst"] {
            XCTAssertTrue(ConversationEncryptionActivationPolicy.mayActivate(platformRole: role), role)
        }
    }

    func test_mayActivate_analystAuditModeratorOfferActivationInRowAndSheet() {
        for role in ["ANALYST", "audit", "MODERATOR"] {
            let mayActivate = ConversationEncryptionActivationPolicy.mayActivate(platformRole: role)
            XCTAssertEqual(
                ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayToggle: mayActivate),
                .directEntry(offersToggle: true), role
            )
            XCTAssertEqual(
                ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayToggle: mayActivate),
                .activation, role
            )
        }
    }

    /// #12880 — l'utilisateur ordinaire VOIT l'état et son explication ; seul
    /// le bouton de bascule lui reste caché.
    func test_mayActivate_userSeesTheRowWithoutTheToggle() {
        for role in ["USER", "user"] {
            let mayActivate = ConversationEncryptionActivationPolicy.mayActivate(platformRole: role)
            XCTAssertEqual(
                ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayToggle: mayActivate),
                .directEntry(offersToggle: false), role
            )
            XCTAssertEqual(
                ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayToggle: mayActivate),
                .inactiveReadOnly, role
            )
        }
    }

    func test_mayActivate_anyLowerOrUnknownRole_refused() {
        for role in ["USER", "user", "AGENT", "", "OWNER", "MEMBER", "ANALYSTS"] {
            XCTAssertFalse(ConversationEncryptionActivationPolicy.mayActivate(platformRole: role), role)
        }
        XCTAssertFalse(ConversationEncryptionActivationPolicy.mayActivate(platformRole: nil))
    }

    func test_securityRow_directUnencrypted_offersActivationOnlyWhenAllowed() {
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayToggle: true),
            .directEntry(offersToggle: true)
        )
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayToggle: false),
            .directEntry(offersToggle: false)
        )
    }

    func test_securityRow_directEncrypted_offersDeactivationOnlyToTheAllowedRole() {
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: true, mayToggle: true),
            .directEntry(offersToggle: true)
        )
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: true, mayToggle: false),
            .directEntry(offersToggle: false)
        )
    }

    /// #12880 — un groupe explique aussi son chiffrement, sans proposer de
    /// bascule (#12844), et garde l'entrée du numéro de sécurité s'il est chiffré.
    func test_securityRow_group_explainsAndKeepsSafetyNumberEntryWhenEncrypted() {
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: false, isEncrypted: true, mayToggle: true),
            .groupEntry(showsSafetyNumber: true)
        )
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: false, isEncrypted: false, mayToggle: true),
            .groupEntry(showsSafetyNumber: false)
        )
    }

    func test_detailSheet_unencrypted_rendersActivationOnlyWhenAllowed() {
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayToggle: true),
            .activation
        )
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayToggle: false),
            .inactiveReadOnly
        )
    }

    func test_detailSheet_encrypted_offersDeactivationOnlyToTheAllowedRole() {
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: true, mayToggle: true),
            .active(offersDeactivation: true)
        )
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: true, mayToggle: false),
            .active(offersDeactivation: false)
        )
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: true, isEncrypted: false, mayToggle: true),
            .loading
        )
    }

    /// La passerelle sert `canToggleEncryption` (#12522, spec § 5.3) : il fait
    /// foi ; une passerelle plus ancienne ne le sert pas, la politique de rôle
    /// prend alors le relais.
    func test_mayToggle_readsTheServedRight_elseFallsBackToTheRole() {
        XCTAssertTrue(ConversationEncryptionActivationPolicy.mayToggle(served: true, platformRole: "USER"))
        XCTAssertFalse(ConversationEncryptionActivationPolicy.mayToggle(served: false, platformRole: "ADMIN"))
        XCTAssertTrue(ConversationEncryptionActivationPolicy.mayToggle(served: nil, platformRole: "ANALYST"))
        XCTAssertFalse(ConversationEncryptionActivationPolicy.mayToggle(served: nil, platformRole: "USER"))
    }

    /// La bascule vue depuis le fil ouvert se DIT (#12522) : désactiver annonce
    /// le retour de la traduction et de la transcription par le serveur.
    func test_switchAnnouncement_saysWhatComesBackAfterDeactivation() {
        let disabled = ConversationEncryptionChangedEvent(
            conversationId: "c1", isEncrypted: false, mode: nil, epoch: 2, changedByUserId: "u1", changedAt: "2026-10-25T10:00:00.000Z"
        )
        let enabled = ConversationEncryptionChangedEvent(
            conversationId: "c1", isEncrypted: true, mode: "e2ee", epoch: 3, changedByUserId: "u1", changedAt: "2026-10-25T10:00:00.000Z"
        )

        XCTAssertFalse(EncryptionSwitchAnnouncement.text(for: disabled).isEmpty)
        XCTAssertNotEqual(EncryptionSwitchAnnouncement.text(for: disabled), EncryptionSwitchAnnouncement.text(for: enabled))
    }
}
