import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class IdentityBarElementTests: XCTestCase {

    func test_element_name_hasStableId() {
        let a = IdentityBarElement.name
        let b = IdentityBarElement.name
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "name")
    }

    func test_element_username_hasStableId() {
        let a = IdentityBarElement.username("alice")
        let b = IdentityBarElement.username("alice")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "username:alice")

        let c = IdentityBarElement.username("bob")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_time_hasStableId() {
        let a = IdentityBarElement.time("14:30")
        let b = IdentityBarElement.time("14:30")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "time:14:30")

        let c = IdentityBarElement.time("09:15")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_roleBadge_hasStableId() {
        let a = IdentityBarElement.roleBadge(.admin)
        let b = IdentityBarElement.roleBadge(.admin)
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "role:admin")

        let c = IdentityBarElement.roleBadge(.moderator)
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_delivery_hasStableId() {
        let a = IdentityBarElement.delivery(.sent)
        let b = IdentityBarElement.delivery(.sent)
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "delivery:sent")

        let c = IdentityBarElement.delivery(.read)
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_text_hasStableId() {
        let a = IdentityBarElement.text("Hello")
        let b = IdentityBarElement.text("Hello")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "text:Hello")

        let c = IdentityBarElement.text("World")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_avatarConfig_initDefaults() {
        let config = AvatarConfig(accentColor: "#6366F1")
        XCTAssertNil(config.url)
        XCTAssertEqual(config.accentColor, "#6366F1")
        XCTAssertNil(config.moodEmoji)
        XCTAssertEqual(config.presenceState, .offline)
        XCTAssertNil(config.onTap)
        XCTAssertNil(config.contextMenuItems)
    }
}
