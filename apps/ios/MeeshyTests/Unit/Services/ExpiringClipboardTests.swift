import XCTest
import UIKit
import UniformTypeIdentifiers
@testable import Meeshy

@MainActor
final class ExpiringClipboardTests: XCTestCase {

    func test_items_carryTheSecretAsPlainText_andExpireAfter30s() {
        let now = Date(timeIntervalSince1970: 1_000)
        let payload = ExpiringClipboard.payload(for: "JBSWY3DPEHPK3PXP", now: now)

        XCTAssertEqual(payload.items.count, 1)
        XCTAssertEqual(payload.items.first?[UTType.utf8PlainText.identifier] as? String, "JBSWY3DPEHPK3PXP")
        XCTAssertEqual(payload.options[.expirationDate] as? Date, now.addingTimeInterval(30))
    }

    func test_options_keepTheSecretOffTheUniversalClipboard() {
        let payload = ExpiringClipboard.payload(for: "x", now: Date())

        XCTAssertEqual(payload.options[.localOnly] as? Bool, true)
    }
}
