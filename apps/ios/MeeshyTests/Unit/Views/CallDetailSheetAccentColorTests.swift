import XCTest
@testable import Meeshy

/// Guards against the drift found during the 2026-08-11 calling-stack audit:
/// `CallDetailSheet` (People-hub call journal) and `CallSummaryDetailSheet`
/// (in-chat bubble call notice, `BubbleCallNoticeView.swift`) render the same
/// logical record but had drifted onto two different tint sources — the
/// latter correctly uses the conversation's accent color, the former had
/// hardcoded `MeeshyColors.indigo500`, violating the project's own rule
/// ("ALL conversation-context components MUST use accentColor, never
/// hardcode colors" — apps/ios/CLAUDE.md § Conversation Accent Color).
@MainActor
final class CallDetailSheetAccentColorTests: XCTestCase {

    private func callDetailSheetSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Contacts/CallDetailSheet.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_fileNeverHardcodesBrandIndigo() throws {
        let source = try callDetailSheetSource()
        XCTAssertFalse(
            source.contains("MeeshyColors.indigo500"),
            "CallDetailSheet must derive its tint from the per-caller accentColor " +
            "(DynamicColorGenerator.colorForName), never a hardcoded brand color — " +
            "otherwise the People-hub call journal and the in-chat call-summary sheet " +
            "render the same record with two different tints."
        )
    }

    func test_detailRow_iconUsesAccentColor() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private func detailRow") else {
            XCTFail("detailRow must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".foregroundColor(accentColor)"),
            "detailRow's icon must tint with the shared accentColor computed property."
        )
    }

    func test_redialButton_capsuleUsesAccentColor() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private func redialButton") else {
            XCTFail("redialButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1100, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Capsule().fill(accentColor)"),
            "redialButton's background must fill with the shared accentColor property, " +
            "matching the avatar tint above it."
        )
    }

    func test_header_avatarUsesSharedAccentColorProperty() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private var header") else {
            XCTFail("header must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("accentColor: accentHex"),
            "header's MeeshyAvatar must use the shared accentHex property (MeeshyAvatar.accentColor " +
            "is a hex String, not the SwiftUI accentColor Color) — not a locally-shadowed duplicate " +
            "DynamicColorGenerator.colorForName(...) call."
        )
    }
}
