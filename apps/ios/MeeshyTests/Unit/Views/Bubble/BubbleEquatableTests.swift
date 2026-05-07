import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class BubbleEquatableTests: XCTestCase {

    func test_bubbleBackground_sameInputs_equal() {
        let a = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_bubbleBackground_differentTheme_notEqual() {
        let a = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: true)
        XCTAssertNotEqual(a, b)
    }
}
