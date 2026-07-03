import XCTest
@testable import Meeshy

@MainActor
final class CallDetailSheetAccessibilityTests: XCTestCase {

    private func callDetailSheetSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Contacts/CallDetailSheet.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - detailRow

    func test_detailRow_hidesDecorativeIconFromVoiceOver() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private func detailRow") else {
            XCTFail("detailRow must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityHidden(true)"),
            "detailRow's leading SF Symbol is purely decorative — without .accessibilityHidden(true) " +
            "VoiceOver announces the raw symbol name (e.g. 'arrow up arrow down') as its own stop."
        )
    }

    func test_detailRow_combinesIntoSingleAccessibilityElement() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private func detailRow") else {
            XCTFail("detailRow must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .combine)"),
            "detailRow must combine its label + value into one VoiceOver stop " +
            "(e.g. 'Données, 12.3 MB') instead of two separate swipes."
        )
    }

    // MARK: - header

    func test_header_hidesDecorativeIconFromVoiceOver() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private var header") else {
            XCTFail("header must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityHidden(true)"),
            "header's direction icon (video.fill/phone.fill) is decorative — statusLine already " +
            "conveys the same information as text."
        )
    }

    func test_header_combinesStatusLineIntoSingleAccessibilityElement() throws {
        let source = try callDetailSheetSource()
        guard let range = source.range(of: "private var header") else {
            XCTFail("header must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .combine)"),
            "header's icon + statusLine row must combine into a single VoiceOver stop."
        )
    }
}
