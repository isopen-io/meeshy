import XCTest
@testable import Meeshy

/// The mood composer is presented as a detented sheet from four separate entry
/// points. Two properties have to hold at every one of them, and neither is
/// expressible from inside the composer itself:
///
/// 1. **The sheet can grow.** The composer's labels scale with Dynamic Type while
///    its emoji grid is pinned to fixed 56pt cells, so at accessibility text sizes
///    the content outgrows the `.medium` detent. A `[.medium]`-only sheet has
///    nowhere to grow to, which strands the text field and the mood question below
///    the fold.
/// 2. **The resize gesture is discoverable.** A drag indicator is the only visible
///    affordance telling the user the sheet is resizable at all.
///
/// The composer's own side of the contract — a scroll container, so content is
/// never clipped outright, and interactive keyboard dismissal, so the keyboard
/// cannot permanently cover the sheet — is asserted here too, since the three
/// properties only add up to a usable sheet together.
@MainActor
final class StatusComposerSheetPresentationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Drops `//` line comments so an assertion about *code* is not satisfied — or
    /// defeated — by a comment that merely names the construct it forbids.
    private func code(_ relativePath: String) throws -> String {
        try source(relativePath)
            .components(separatedBy: "\n")
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line[...] }
                return line[..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    private let composerPath = "Meeshy/Features/Main/Views/StatusComposerView.swift"

    // MARK: - The composer's own side of the contract

    func test_composer_hostsContentInAScrollView() throws {
        let swift = try code(composerPath)
        XCTAssertTrue(
            swift.contains("ScrollView {"),
            "StatusComposerView must host its stack in a ScrollView: the emoji grid uses fixed " +
            "56pt cells while every surrounding label scales with Dynamic Type, so at " +
            "accessibility sizes the content exceeds the .medium detent and would be clipped " +
            "with no gesture left to reach the text field."
        )
    }

    func test_composer_dismissesKeyboardOnScroll() throws {
        let swift = try code(composerPath)
        XCTAssertTrue(
            swift.contains(".scrollDismissesKeyboard(.interactively)"),
            "The composer's text field sits at the bottom of a medium-detent sheet, where the " +
            "keyboard covers most of the content. Interactive dismissal is the native way out " +
            "and is the pattern already used by the onboarding and search scroll views."
        )
    }

    func test_composer_containsNoDeadSpacer() throws {
        // Every stack in this file now lives inside the vertical ScrollView, where a
        // spacer is proposed unbounded height and resolves to zero. Keeping one would
        // express layout intent the container cannot honour — it reads as deliberate
        // bottom padding that does not exist.
        let swift = try code(composerPath)
        XCTAssertFalse(
            swift.contains("Spacer()"),
            "A Spacer() inside the composer's vertical ScrollView resolves to zero height. " +
            "Use explicit padding if bottom spacing is wanted."
        )
    }

    // MARK: - Every presentation site

    /// Files that present `StatusComposerView` in a sheet, and the modifiers that
    /// follow each presentation.
    private struct PresentationSite {
        let file: String
        let line: Int
        let modifiers: String
    }

    /// Modifiers are chained on the lines immediately following the initializer, so
    /// a bounded look-ahead captures them without parsing Swift. The window is
    /// generous enough to clear the widest call site (six labelled arguments).
    private func presentationSites() throws -> [PresentationSite] {
        // `RootView` et `iPadRootView` présentent le composer pré-rempli
        // (republication depuis la bulle de mood) : cet état, mort dans
        // `ConversationListView`, a remonté aux racines de fenêtre avec l'hôte
        // unique de la bulle (2026-07-30). Sans ces deux fichiers ici, deux
        // présentations sur quatre n'étaient plus couvertes du tout.
        let files = [
            "Meeshy/Features/Main/Views/RootView.swift",
            "Meeshy/Features/Main/Views/iPadRootView.swift",
            "Meeshy/Features/Main/Views/RootViewComponents.swift",
            "Meeshy/Features/Main/Views/ConversationListView.swift",
        ]
        var sites: [PresentationSite] = []
        for file in files {
            let lines = try code(file).components(separatedBy: "\n")
            for (index, line) in lines.enumerated() where line.contains("StatusComposerView(") {
                let window = lines[index..<min(index + 20, lines.count)].joined(separator: "\n")
                sites.append(PresentationSite(file: file, line: index + 1, modifiers: window))
            }
        }
        return sites
    }

    func test_allFourEntryPointsAreDiscovered() throws {
        // Guards the look-ahead itself: if a call site is renamed or added and this
        // count is not revisited, the two assertions below would silently stop
        // covering it.
        XCTAssertEqual(
            try presentationSites().count, 4,
            "Expected exactly four StatusComposerView presentations (one in RootView, one in " +
            "iPadRootView, one in RootViewComponents, one in ConversationListView). Update this " +
            "suite when an entry point is added."
        )
    }

    func test_everyPresentationOffersTheLargeDetent() throws {
        for site in try presentationSites() {
            guard let detents = site.modifiers.range(of: "presentationDetents(") else {
                XCTFail("\(site.file):\(site.line) presents the composer without any detent.")
                continue
            }
            let declaration = site.modifiers[detents.upperBound...].prefix(while: { $0 != "\n" })
            XCTAssertTrue(
                declaration.contains(".medium") && declaration.contains(".large"),
                "\(site.file):\(site.line) must offer [.medium, .large]: at accessibility text " +
                "sizes the composer outgrows .medium, and a single-detent sheet gives the user " +
                "nowhere to grow to. Found: \(declaration)"
            )
        }
    }

    func test_everyPresentationShowsTheDragIndicator() throws {
        for site in try presentationSites() {
            XCTAssertTrue(
                site.modifiers.contains("presentationDragIndicator(.visible)"),
                "\(site.file):\(site.line) must show the drag indicator — it is the only visible " +
                "affordance that the sheet can be resized to reach content below the fold."
            )
        }
    }
}
