import XCTest
@testable import Meeshy

/// Source-level accessibility guard for `ConversationEncryptionDetailSheet`
/// (iteration 210i).
///
/// The active-encryption "Encryption enabled" row pairs a visible label with a
/// disabled, always-on `Toggle("", isOn: .constant(true)).labelsHidden()` that
/// the backend keeps immutable. With an empty label and `.labelsHidden()`, and
/// no `.accessibilityLabel`, VoiceOver announced only an unlabeled "on, dimmed,
/// switch" with zero context. The toggle is a read-only status indicator,
/// redundant with the adjacent label, so the whole row is exposed as a single
/// combined element and the decorative lock glyph is hidden — VoiceOver now
/// reads one coherent "Encryption enabled" element. Same pattern as
/// `ActiveSessionsViewAccessibilityTests` (combine informational row + hide
/// decorative glyph).
@MainActor
final class ConversationEncryptionDetailSheetAccessibilityTests: XCTestCase {

    private func encryptionSheetSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The immutable-status row must expose its label + switch state as ONE
    /// VoiceOver element rather than a bare unlabeled "dimmed switch".
    func test_encryptionEnabledRow_isCombinedIntoOneVoiceOverElement() throws {
        let source = try encryptionSheetSource()
        XCTAssertTrue(
            source.contains(".accessibilityElement(children: .combine)"),
            "The 'Encryption enabled' row wraps a disabled, empty-label toggle whose " +
            "switch would read as an unlabeled 'dimmed switch'. The row must combine " +
            "into a single VoiceOver element so the visible label supplies the context."
        )
    }

    /// The decorative lock glyph carries no information beyond the label and must
    /// not add a stray "lock" announcement inside the combined element.
    func test_encryptionEnabledRow_hidesDecorativeLockGlyph() throws {
        let source = try encryptionSheetSource()
        guard let range = source.range(of: "lock.fill") else {
            XCTFail("ConversationEncryptionDetailSheet.swift must render the lock.fill status glyph")
            return
        }
        let vicinity = String(source[range.lowerBound...].prefix(160))
        XCTAssertTrue(
            vicinity.contains(".accessibilityHidden(true)"),
            "The decorative lock.fill glyph in the 'Encryption enabled' row must be hidden " +
            "from VoiceOver so the combined element reads only its meaningful label."
        )
    }
}
