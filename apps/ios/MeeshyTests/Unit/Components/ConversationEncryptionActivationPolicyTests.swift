import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le chiffrement ne s'active que par un administrateur de la plateforme
/// tant que l'E2EE n'est pas opérationnel (#12517).**
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

    func test_mayActivate_anyLowerOrUnknownRole_refused() {
        for role in ["USER", "MODERATOR", "AUDIT", "ANALYST", "AGENT", "", "OWNER"] {
            XCTAssertFalse(ConversationEncryptionActivationPolicy.mayActivate(platformRole: role), role)
        }
        XCTAssertFalse(ConversationEncryptionActivationPolicy.mayActivate(platformRole: nil))
    }

    func test_securityRow_directUnencrypted_offersActivationToAdminOnly() {
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayActivate: true),
            .directEntry(offersActivation: true)
        )
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: false, mayActivate: false),
            .hidden
        )
    }

    func test_securityRow_directEncrypted_showsStateWithoutActivation() {
        for mayActivate in [true, false] {
            XCTAssertEqual(
                ConversationSecurityRowContent.resolve(isDirect: true, isEncrypted: true, mayActivate: mayActivate),
                .directEntry(offersActivation: false)
            )
        }
    }

    func test_securityRow_group_keepsSafetyNumberEntryWhenEncrypted() {
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: false, isEncrypted: true, mayActivate: false),
            .safetyNumberEntry
        )
        XCTAssertEqual(
            ConversationSecurityRowContent.resolve(isDirect: false, isEncrypted: false, mayActivate: true),
            .hidden
        )
    }

    func test_detailSheet_unencrypted_rendersActivationOnlyForAdmin() {
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayActivate: true),
            .activation
        )
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: false, mayActivate: false),
            .inactiveReadOnly
        )
    }

    func test_detailSheet_encryptedOrLoading_neverRendersActivation() {
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: false, isEncrypted: true, mayActivate: true),
            .active
        )
        XCTAssertEqual(
            ConversationEncryptionDetailContent.resolve(isLoading: true, isEncrypted: false, mayActivate: true),
            .loading
        )
    }
}
