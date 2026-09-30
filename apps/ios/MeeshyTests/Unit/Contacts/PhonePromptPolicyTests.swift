import XCTest
import MeeshySDK
@testable import Meeshy

/// #8843 — chercher ses contacts propose d'abord d'ajouter son numéro, et
/// JAMAIS à qui en a déjà un.
final class PhonePromptPolicyTests: XCTestCase {

    private func makeUser(phone: String?, isAnonymous: Bool? = nil) -> MeeshyUser {
        MeeshyUser(id: "u1", username: "alice", isAnonymous: isAnonymous, phoneNumber: phone)
    }

    func test_shouldOffer_userWithoutPhone_returnsTrue() {
        XCTAssertTrue(PhonePromptPolicy.shouldOffer(user: makeUser(phone: nil)))
    }

    func test_shouldOffer_userWithEmptyPhone_returnsTrue() {
        XCTAssertTrue(PhonePromptPolicy.shouldOffer(user: makeUser(phone: "")))
    }

    func test_shouldOffer_userWithBlankPhone_returnsTrue() {
        XCTAssertTrue(PhonePromptPolicy.shouldOffer(user: makeUser(phone: "   ")))
    }

    func test_shouldOffer_userWithPhone_returnsFalse() {
        XCTAssertFalse(PhonePromptPolicy.shouldOffer(user: makeUser(phone: "+33612345678")))
    }

    func test_shouldOffer_noUser_returnsFalse() {
        XCTAssertFalse(PhonePromptPolicy.shouldOffer(user: nil))
    }

    func test_shouldOffer_anonymousUser_returnsFalse() {
        XCTAssertFalse(PhonePromptPolicy.shouldOffer(user: makeUser(phone: nil, isAnonymous: true)))
    }
}
