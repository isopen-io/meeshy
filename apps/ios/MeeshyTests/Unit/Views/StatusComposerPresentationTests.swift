import XCTest
@testable import Meeshy

/// `StatusComposerView` is presented as a sheet from three call sites. Its body is a
/// fixed `VStack` — a 2×5 emoji grid of 56pt buttons, the visibility rail, the text
/// field — with no `ScrollView`. Every one of those uses `MeeshyFont.relative`, which
/// scales with Dynamic Type, so at accessibility text sizes the stack outgrows a
/// medium detent and the content below the fold (including the character counter, and
/// on the shortest devices the field itself) becomes unreachable.
///
/// Offering `.large` alongside `.medium` is the fix: the initial detent is unchanged
/// (SwiftUI opens on the first one), it only gives the user a way out. The drag
/// indicator is what makes that resize discoverable — the pair is the app's dominant
/// convention for medium sheets, `InviteFriendsSheet` in this very file included.
///
/// These are source-level assertions: sheet detents are not observable from a unit
/// test, and the repository has no snapshot harness for presentation modifiers.
@MainActor
final class StatusComposerPresentationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private let callSites = [
        "Meeshy/Features/Main/Views/RootViewComponents.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift"
    ]

    /// The modifier block applied to each `StatusComposerView` presentation, i.e. the
    /// lines between the call and the end of its sheet closure.
    private func presentationBlocks() throws -> [(site: String, body: String)] {
        try callSites.flatMap { path -> [(site: String, body: String)] in
            let lines = try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
                .components(separatedBy: .newlines)
            return lines.indices
                .filter { lines[$0].contains("StatusComposerView(") }
                .map { start -> (site: String, body: String) in
                    let end = min(start + 15, lines.count)
                    return (site: path, body: lines[start..<end].joined(separator: "\n"))
                }
        }
    }

    func test_everyCallSite_isDiscovered() throws {
        // Guards the two assertions below against silently scanning nothing if a
        // presentation is moved to another file.
        XCTAssertEqual(try presentationBlocks().count, 3)
    }

    func test_everyCallSite_offersTheLargeDetentAsAnEscapeHatch() throws {
        for (site, body) in try presentationBlocks() {
            XCTAssertTrue(
                body.contains(".presentationDetents([.medium, .large])"),
                "\(site): the status composer must offer .large next to .medium. Its fixed, " +
                "unscrollable VStack outgrows a medium detent at accessibility text sizes, " +
                "leaving the bottom of the form unreachable."
            )
        }
    }

    func test_everyCallSite_showsTheDragIndicator() throws {
        for (site, body) in try presentationBlocks() {
            XCTAssertTrue(
                body.contains(".presentationDragIndicator(.visible)"),
                "\(site): a resizable sheet needs a visible drag indicator, otherwise the " +
                ".large detent is an affordance the user has no way to discover."
            )
        }
    }
}
