import XCTest
import Foundation
@testable import MeeshyUI

@MainActor
final class NotificationListCopyTests: XCTestCase {

    private func lproj(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.module.path(forResource: code, ofType: "lproj"),
            "\(code).lproj absent de Bundle.module"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    func test_unreadLabel_pluriel() throws {
        XCTAssertEqual(NotificationListCopy.unreadLabel(count: 1, in: try lproj("fr")), "1 non lue")
        XCTAssertEqual(NotificationListCopy.unreadLabel(count: 3, in: try lproj("fr")), "3 non lues")
        XCTAssertEqual(NotificationListCopy.unreadLabel(count: 1, in: try lproj("en")), "1 unread")
        XCTAssertEqual(NotificationListCopy.unreadLabel(count: 3, in: try lproj("en")), "3 unread")
    }

    func test_unreadLabel_arabe_neRendPasLaCleBrute() throws {
        for count in [1, 2, 3, 11, 100] {
            let label = NotificationListCopy.unreadLabel(count: count, in: try lproj("ar"))
            XCTAssertFalse(label.contains("notifications.unreadCount"), "\(count)")
            XCTAssertTrue(label.contains("\(count)"), "\(count)")
        }
    }
}
