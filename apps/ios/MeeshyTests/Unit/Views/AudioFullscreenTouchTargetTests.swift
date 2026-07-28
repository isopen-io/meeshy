import XCTest
@testable import Meeshy

/// A `Button`'s tappable region is exactly its label's layout region. The three
/// chrome controls of the fullscreen audio player sized that region below the
/// 44 pt HIG floor — the close control, which is the only way out of the screen,
/// was a 36 pt pill.
///
/// The fix keeps each visible pill at its frozen size (doctrines 82i / 86i, which
/// froze the glyph against Dynamic Type) and wraps it in a 44 pt hit region. These
/// tests lock BOTH halves: a future "cleanup" that grows the pill instead of the
/// target, or drops the target instead of the pill, fails here.
@MainActor
final class AudioFullscreenTouchTargetTests: XCTestCase {

    private func source() throws -> String {
        // Four hops, not three: the first drops the test file itself, and only the
        // fourth lands on apps/ios. Three left the path at apps/ios/MeeshyTests, so
        // every read threw NSFileReadNoSuchFile and every test in here errored out.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Unit/Views
            .deletingLastPathComponent()   // …/Unit
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/AudioFullscreenView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Comments are stripped before matching: an explanatory comment naming
    /// `frame(width: 44…)` must never be what satisfies an assertion, and a comment
    /// sitting between two modifiers must not push them out of a search window.
    private func strippedSource() throws -> String {
        try source()
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex ..< range.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// The window following an anchor, on comment-stripped source.
    ///
    /// Span measured, not guessed: on stripped source the `.contentShape` sits at
    /// 299 / 326 / 315 characters past its anchor for the close / save / translate
    /// controls. 380 clears the furthest with room for a modifier to be inserted,
    /// and still stops well short of the next control.
    private func window(after anchor: String, in source: String, span: Int = 380) throws -> String {
        guard let range = source.range(of: anchor) else {
            XCTFail("AudioFullscreenView must contain \(anchor)")
            return ""
        }
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    // MARK: - Each control reaches the floor

    func test_closeControl_reachesTheFortyFourPointFloor() throws {
        // The close control is the ONLY way out of the fullscreen player: a missed
        // tap traps the user on the screen.
        let source = try strippedSource()
        let near = try window(after: "Image(systemName: \"xmark\")", in: source)
        XCTAssertTrue(
            near.contains(".frame(width: 44, height: 44)"),
            "The fullscreen player's close control must expose a 44 pt hit region — it is the " +
            "only exit from the screen."
        )
        XCTAssertTrue(
            near.contains(".contentShape(Circle())"),
            "Without .contentShape the transparent ring between the 36 pt pill and the 44 pt " +
            "edge does not reliably participate in hit-testing."
        )
    }

    func test_saveControl_reachesTheFortyFourPointFloor() throws {
        let source = try strippedSource()
        let near = try window(after: "Image(systemName: \"arrow.down.to.line\")", in: source)
        XCTAssertTrue(
            near.contains(".frame(width: 44, height: 44)") && near.contains(".contentShape(Circle())"),
            "The save control must expose a 44 pt hit region."
        )
    }

    func test_translateControl_reachesTheFortyFourPointFloor() throws {
        let source = try strippedSource()
        let near = try window(after: "Image(systemName: \"translate\")", in: source)
        XCTAssertTrue(
            near.contains(".frame(width: 44, height: 44)") && near.contains(".contentShape(Circle())"),
            "The translate control must expose a 44 pt hit region."
        )
    }

    // MARK: - The visuals must not have grown instead

    func test_visiblePillsKeepTheirFrozenSize() throws {
        // This is the assertion that fails if someone "fixes" the floor by enlarging
        // the pills — which would be a design change smuggled in under an
        // accessibility fix, and would break the Dynamic Type freeze of 82i/86i.
        let source = try strippedSource()
        XCTAssertEqual(
            source.components(separatedBy: ".frame(width: 36, height: 36)").count - 1, 2,
            "The two 36 pt chrome pills must keep their frozen size; only the hit region grows."
        )
        XCTAssertEqual(
            source.components(separatedBy: ".frame(width: 26, height: 26)").count - 1, 1,
            "The 26 pt translate pill must keep its frozen size — it overflows its row if it scales."
        )
    }

    func test_everyRaisedControlKeepsItsAccessibilityLabel() throws {
        // The motor pass must not cost the screen-reader pass: all three controls are
        // icon-only, so each needs a name.
        let source = try strippedSource()
        for key in ["common.close", "audio.fullscreen.language.choose"] {
            XCTAssertTrue(
                source.contains(key),
                "\(key) must still name its icon-only control after the touch-target change."
            )
        }
    }
}
