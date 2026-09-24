import XCTest
@testable import Meeshy

/// Iteration 216i — finishes the share-presentation convergence started in 215i.
///
/// 215i fixed the three sites that minted their link *asynchronously* by routing
/// them through `.sheet(item:)`. The two remaining imperative sites know their
/// URL **synchronously**, so they get the simpler and more native answer: SwiftUI's
/// `ShareLink`, exactly as `CommunityLinkDetailView` already does.
///
/// What the hand-rolled path got wrong, even though both sites *did* configure the
/// iPad popover anchor correctly:
///
/// - **Nondeterministic scene.** Both resolved the presenter from
///   `UIApplication.shared.connectedScenes.first`. `connectedScenes` is an
///   *unordered* `Set`, so under iPad multitasking / Stage Manager `.first` can
///   return a background scene — the sheet is presented on a window the user
///   cannot see and sharing appears to do nothing.
/// - **Dead control.** When the URL failed to parse, the `Button` remained visible
///   and tappable but its action returned immediately: a control that looks
///   available, is reachable by VoiceOver, and does nothing.
///
/// `ShareLink` removes the traversal entirely (SwiftUI anchors and routes against
/// the presenting view's own scene) and makes the unavailable case expressible in
/// the view tree instead of hidden in a `guard`.
@MainActor
final class NativeShareLinkAdoptionTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let affiliateView = "Meeshy/Features/Main/Views/AffiliateView.swift"
    private static let shareLinkDetailView = "Meeshy/Features/Main/Views/ShareLinkDetailView.swift"

    private func readSource(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Production source with comment-only lines dropped, so asserting the
    /// *absence* of an API is not defeated by a comment that documents why the
    /// API was removed.
    private func code(_ relativePath: String) throws -> String {
        try readSource(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    // MARK: - Native ShareLink adopted

    func test_affiliateView_sharesTokenLinkWithNativeShareLink() throws {
        let source = try readSource(Self.affiliateView)

        XCTAssertTrue(
            source.contains("ShareLink(item: url)"),
            "The affiliate token share affordance must use SwiftUI's ShareLink so the activity " +
            "sheet, the iPad popover anchor and top-VC presentation come from the framework."
        )
        XCTAssertTrue(
            source.contains("shareTokenButton(token)"),
            "tokenRow must delegate to the shareTokenButton builder rather than inline an " +
            "imperative presentation."
        )
    }

    func test_shareLinkDetailView_sharesJoinUrlWithNativeShareLink() throws {
        let source = try readSource(Self.shareLinkDetailView)

        XCTAssertTrue(
            source.contains("ShareLink(item: url)"),
            "The share-link detail share affordance must use SwiftUI's ShareLink."
        )
        // Comment-stripped: the doc comment above shareActionButton names the
        // removed helper on purpose, to explain what it got wrong.
        XCTAssertFalse(
            try code(Self.shareLinkDetailView).contains("presentSheet"),
            "The presentSheet(_:) helper must be gone: it was the last caller of the " +
            "window-hierarchy walk in this file."
        )
    }

    // MARK: - The unavailable case is no longer a dead control

    func test_shareAffordances_hideThemselvesWhenTheUrlIsUnusable() throws {
        // Anchored on the ShareLink itself: `.accessibilityHidden(true)` and
        // `.opacity(0.4)` both occur elsewhere in these files, so a bare
        // file-wide `contains` would pass even without the fallback branch.
        for path in [Self.affiliateView, Self.shareLinkDetailView] {
            let source = try readSource(path)
            guard let anchor = source.range(of: "ShareLink(item: url)") else {
                XCTFail("\(path) must contain a ShareLink to anchor the fallback assertion on")
                return
            }
            let end = source.index(anchor.upperBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
            let fallback = String(source[anchor.upperBound ..< end])

            XCTAssertTrue(
                fallback.contains(".opacity(0.4)") && fallback.contains(".accessibilityHidden(true)"),
                "\(path): the else-branch right after the ShareLink must dim the affordance and " +
                "hide it from VoiceOver when the URL cannot be parsed. Previously the Button " +
                "stayed enabled and its action returned immediately — a control that announces " +
                "itself to VoiceOver and then does nothing."
            )
        }
    }

    // MARK: - The label extraction must not break the sibling button

    /// `ShareLink` needs the label body on its own, so the hero card's buttons
    /// render through one builder, `heroButtonLabel`. Since #7797 the fiche's
    /// two link actions — Partager (the ShareLink) and Copier le lien — sit
    /// side by side in the hero card; both must keep going through it, or the
    /// pair silently loses its uniform styling.
    func test_shareLinkDetailView_heroActionsShareOneLabelBuilder() throws {
        let source = try readSource(Self.shareLinkDetailView)

        XCTAssertTrue(
            source.contains("private func heroButtonLabel("),
            "The hero card must keep a single label builder for its actions."
        )
        XCTAssertTrue(
            source.contains("heroButtonLabel(ShareLinkDetailCopy.share, icon: \"square.and.arrow.up\", filled: true)"),
            "The ShareLink must reuse the hero label builder."
        )
        XCTAssertTrue(
            source.contains("heroButtonLabel(copiedFeedback ? ShareLinkDetailCopy.copied : ShareLinkDetailCopy.copyLink"),
            "The copy action must reuse the same label builder as the ShareLink."
        )
    }

    // MARK: - Single-source-of-truth lock

    /// Neither file may reintroduce a manual activity-sheet presentation.
    ///
    /// Scoped to these two files on purpose: the repo-wide sweep lives in
    /// `StoryExportShareSheetPaletteTests`, which since 217i asserts an
    /// *equality* — `ShareSheet` is the only bridge left, the last imperative
    /// site (`StoryViewerView+Content.shareStory()`, dead code) having been
    /// deleted. Duplicating that sweep here would give it two owners.
    func test_convergedFiles_containNoManualActivityPresentation() throws {
        for path in [Self.affiliateView, Self.shareLinkDetailView] {
            let source = try code(path)

            XCTAssertFalse(
                source.contains("UIActivityViewController("),
                "\(path) must not construct a UIActivityViewController — use ShareLink."
            )
            XCTAssertFalse(
                source.contains("popoverPresentationController"),
                "\(path) must not configure a popover anchor by hand — ShareLink does it."
            )
            XCTAssertFalse(
                source.contains("connectedScenes"),
                "\(path) must not resolve a presenter from connectedScenes: it is an unordered " +
                "Set, so .first can return a background scene."
            )
        }
    }
}
