import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class ContactCardViewTests: XCTestCase {

    private func makeContact(
        fullName: String = "Ada Lovelace",
        phoneNumbers: [String] = [],
        emails: [String] = []
    ) -> SharedContact {
        SharedContact(fullName: fullName, phoneNumbers: phoneNumbers, emails: emails)
    }

    func test_accessibilityLabel_alwaysIncludesFullName() {
        let label = ContactCardView.accessibilityLabel(for: makeContact())
        XCTAssertTrue(label.contains("Ada Lovelace"))
    }

    func test_accessibilityLabel_announcesPhoneNumbers() {
        let contact = makeContact(phoneNumbers: ["+33 6 12 34 56 78"])
        let label = ContactCardView.accessibilityLabel(for: contact)
        XCTAssertTrue(label.contains("+33 6 12 34 56 78"))
    }

    func test_accessibilityLabel_announcesEmails() {
        let contact = makeContact(emails: ["ada@analytical.engine"])
        let label = ContactCardView.accessibilityLabel(for: contact)
        XCTAssertTrue(label.contains("ada@analytical.engine"))
    }

    func test_accessibilityLabel_joinsMultipleValuesOfSameKind() {
        let contact = makeContact(phoneNumbers: ["+33 1", "+33 2"])
        let label = ContactCardView.accessibilityLabel(for: contact)
        XCTAssertTrue(label.contains("+33 1"))
        XCTAssertTrue(label.contains("+33 2"))
    }

    func test_accessibilityLabel_announcesBothPhonesAndEmails() {
        let contact = makeContact(phoneNumbers: ["+33 6"], emails: ["a@b.co"])
        let label = ContactCardView.accessibilityLabel(for: contact)
        XCTAssertTrue(label.contains("+33 6"))
        XCTAssertTrue(label.contains("a@b.co"))
    }

    func test_accessibilityLabel_omitsContactValuesWhenAbsent() {
        let label = ContactCardView.accessibilityLabel(for: makeContact())
        XCTAssertFalse(label.contains("@"))
        XCTAssertFalse(label.contains("+"))
    }
}
