import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class MeeshyShortcutTests: XCTestCase {

    func test_allCases_haveDistinctKeyCombinations() {
        let combinations = MeeshyShortcut.allCases.map { "\($0.key.character)-\($0.modifiers.rawValue)" }
        XCTAssertEqual(Set(combinations).count, combinations.count)
    }

    func test_sections_areCommandOneToFourInOrder() {
        XCTAssertEqual(MeeshyShortcut.sections, [.conversations, .contacts, .notifications, .settings])
        XCTAssertEqual(MeeshyShortcut.sections.map { $0.key.character }, ["1", "2", "3", "4"])
        XCTAssertTrue(MeeshyShortcut.sections.allSatisfy { $0.modifiers == .command })
    }

    func test_bindings_matchTheMenuContract() {
        XCTAssertEqual(MeeshyShortcut.newConversation.key.character, "n")
        XCTAssertEqual(MeeshyShortcut.search.key.character, "f")
        XCTAssertEqual(MeeshyShortcut.closeWindow.key.character, "w")
        XCTAssertEqual(MeeshyShortcut.back.key.character, "[")
        XCTAssertTrue(MeeshyShortcut.allCases.filter { !MeeshyShortcut.sections.contains($0) }
            .allSatisfy { $0.modifiers == .command })
    }

    func test_keyboardShortcut_whenPreferenceDisabled_isNilForEveryCase() {
        XCTAssertTrue(MeeshyShortcut.allCases.allSatisfy { $0.keyboardShortcut(enabled: false) == nil })
    }

    func test_keyboardShortcut_whenEnabled_returnsDeclaredKeyAndModifiers() {
        for shortcut in MeeshyShortcut.allCases {
            let rendered = shortcut.keyboardShortcut(enabled: true)
            XCTAssertEqual(rendered?.key.character, shortcut.key.character)
            XCTAssertEqual(rendered?.modifiers, shortcut.modifiers)
        }
    }

    func test_titles_areNonEmpty_andSectionsReuseTheirScreenTitles() {
        XCTAssertTrue(MeeshyShortcut.allCases.allSatisfy { !$0.title.isEmpty })
        XCTAssertEqual(MeeshyShortcut.notifications.title,
                       String(localized: "root.ipad.notifications", defaultValue: "Notifications", bundle: .main))
        XCTAssertEqual(MeeshyShortcut.settings.title,
                       String(localized: "root.ipad.settings", defaultValue: "Paramètres", bundle: .main))
    }
}
