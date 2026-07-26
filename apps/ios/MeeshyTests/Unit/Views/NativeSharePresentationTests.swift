import XCTest
@testable import Meeshy

/// Iteration 215i — the share-link flows must present the system share sheet
/// through SwiftUI (`.sheet(item:)` + `ShareSheet`) instead of walking the
/// window hierarchy to push a `UIActivityViewController` onto the top-most
/// view controller.
///
/// Two defects motivated the convergence:
///
/// 1. **iPad popover mis-anchored.** `UIActivityViewController` is routed as a
///    popover at regular width. The sites below set only
///    `popoverPresentationController?.sourceView` and left `sourceRect` at its
///    `CGRect.zero` default, so the sheet anchored to the *top-left corner* of
///    the window with an arrow pointing into the corner. Three sibling sites
///    (`ShareLinkDetailView`, `AffiliateView`, `TrackingLinkDetailView`) had
///    already worked around this by hand with a centred `sourceRect` +
///    `permittedArrowDirections = []`.
/// 2. **Nondeterministic scene.** All of them resolved the presenter with
///    `UIApplication.shared.connectedScenes.first`. `connectedScenes` is an
///    *unordered* `Set`, so under iPad multitasking / Stage Manager (and any
///    multi-window scenario) `.first` can return a background scene — the
///    sheet is then presented on a window the user cannot see.
///
/// Letting SwiftUI own the presentation removes both failure modes: it anchors
/// and routes the sheet against the presenting view's own scene. The doctrine
/// is already stated in `CommunityLinkDetailView.swift` ("prefer first-party
/// SwiftUI over UIKit") and implemented in `PostDetailView`.
@MainActor
final class NativeSharePresentationTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private static let conversationInfoSheet = "Meeshy/Features/Main/Components/ConversationInfoSheet.swift"
    private static let inviteFriendsSheet = "Meeshy/Features/Main/Components/InviteFriendsSheet.swift"
    private static let conversationListView = "Meeshy/Features/Main/Views/ConversationListView.swift"
    private static let shareLinkDetailView = "Meeshy/Features/Main/Views/ShareLinkDetailView.swift"
    private static let affiliateView = "Meeshy/Features/Main/Views/AffiliateView.swift"
    private static let trackingLinkDetailView = "Meeshy/Features/Main/Views/TrackingLinkDetailView.swift"

    /// Every file this doctrine has been applied to. Growing the list is how an
    /// iteration records that a surface is converged and locked.
    private static let convergedFiles = [
        conversationInfoSheet,
        inviteFriendsSheet,
        conversationListView,
        shareLinkDetailView,
        affiliateView,
        trackingLinkDetailView
    ]

    // MARK: - Converged sites present through SwiftUI

    func test_conversationInfoSheet_presentsShareSheetThroughSwiftUI() throws {
        let source = try source(Self.conversationInfoSheet)

        XCTAssertTrue(
            source.contains("@State private var shareableLink: ShareableLink?"),
            "ConversationInfoSheet must hold the minted join link in a ShareableLink state so the " +
            "system share sheet is presented declaratively."
        )
        XCTAssertTrue(
            source.contains(".sheet(item: $shareableLink)"),
            "ConversationInfoSheet must present the share sheet via .sheet(item:) — SwiftUI then " +
            "anchors the iPad popover and picks the right scene on its own."
        )
        XCTAssertTrue(
            source.contains("ShareSheet(activityItems: [link.url])"),
            "ConversationInfoSheet must reuse the shared ShareSheet representable rather than " +
            "constructing a UIActivityViewController itself."
        )
    }

    func test_inviteFriendsSheet_presentsShareSheetThroughSwiftUI() throws {
        let source = try source(Self.inviteFriendsSheet)

        XCTAssertTrue(
            source.contains("@State private var shareableLink: ShareableLink?"),
            "InviteFriendsSheet must hold the minted invite link in a ShareableLink state."
        )
        XCTAssertTrue(
            source.contains(".sheet(item: $shareableLink)"),
            "InviteFriendsSheet must present the share sheet via .sheet(item:)."
        )
        XCTAssertFalse(
            source.contains("presentShareSheet"),
            "The hand-rolled presentShareSheet(url:) helper must be gone — it walked the window " +
            "hierarchy and left the iPad popover anchored at CGRect.zero."
        )
    }

    /// The share flow feeds `ShareSheet`, whose `activityItems` is `[Any]`. A
    /// `String` there is shared as plain text; a `URL` is recognised as a link
    /// by Messages/Mail/Safari (rich preview, "Open in…" actions). Both call
    /// sites must therefore hand over a real `URL`, which is also what the
    /// existing `ShareableLink` model guarantees by typing `url: URL`.
    func test_shareLinks_areSharedAsURLsNotStrings() throws {
        for path in [Self.conversationInfoSheet, Self.inviteFriendsSheet] {
            let source = try source(path)
            XCTAssertTrue(
                source.contains("ShareableLink(url:"),
                "\(path) must wrap the minted link in ShareableLink(url:) so the share sheet " +
                "receives a URL rather than a bare String."
            )
        }
    }

    // MARK: - Dead share path removed

    func test_conversationListView_dropsUncalledShareConversationLink() throws {
        let source = try source(Self.conversationListView)

        XCTAssertFalse(
            source.contains("func shareConversationLink"),
            "shareConversationLink(for:) had no caller anywhere in the app — the live affordance is " +
            "onCreateShareLink → InviteFriendsSheet. It must stay deleted rather than be revived: " +
            "it carried a third copy of the window-hierarchy walk plus two hardcoded French strings."
        )
        XCTAssertTrue(
            source.contains("inviteSheetConversation = conversation"),
            "The live share affordance (onCreateShareLink → InviteFriendsSheet) must remain wired."
        )
    }

    // MARK: - Iteration 216i — synchronous items go through ShareLink

    /// When the shared item is known at view-construction time, the first-party
    /// answer is `ShareLink` — no state, no representable, no presentation code
    /// at all. `CommunityLinkDetailView` and `TrackingLinkDetailView.shareActionButton`
    /// already used it; the two sites below still hand-rolled the presentation.
    func test_shareLinkDetailView_sharesJoinURLThroughShareLink() throws {
        let source = try source(Self.shareLinkDetailView)

        XCTAssertTrue(
            source.contains("ShareLink(item: url)"),
            "ShareLinkDetailView must share the join URL through a native ShareLink."
        )
        XCTAssertFalse(
            source.contains("func presentSheet"),
            "The hand-rolled presentSheet(_:) helper must be gone — ShareLink replaces it entirely."
        )
        // The malformed-joinUrl case is deliberately NOT asserted here. Both
        // 216i branches removed the dead control; they disagreed only on how.
        // The shipped answer dims it and hides it from VoiceOver, and that
        // shape is locked by `NativeShareLinkAdoptionTests`. Asserting the
        // rejected alternative (sharing the raw string as text) here would
        // pin a form the codebase does not have.
    }

    func test_affiliateView_sharesReferralLinkThroughShareLink() throws {
        let source = try source(Self.affiliateView)

        XCTAssertTrue(
            source.contains("ShareLink(item: url)"),
            "AffiliateView must share the referral link through a native ShareLink."
        )
        // Same arbitration as above: a token whose affiliate link the backend
        // has not minted yet must not leave a control that looks tappable and
        // does nothing. The shipped answer dims the glyph and hides it from
        // VoiceOver rather than rendering a `.disabled` Button; that shape is
        // locked by `NativeShareLinkAdoptionTests`. Re-asserting the rejected
        // `.disabled(true)` form here would make this suite contradict it.
    }

    /// The QR bitmap is rendered on tap, so `ShareLink` (item required up front)
    /// cannot serve it — `.sheet(item:)` is the repo's answer for deferred items,
    /// and it fixes the same two failure modes as the 215i sites.
    func test_trackingLinkDetailView_presentsQRCodeThroughSwiftUI() throws {
        let source = try source(Self.trackingLinkDetailView)

        XCTAssertTrue(
            source.contains("@State private var qrShareImage: QRShareImage?"),
            "TrackingLinkDetailView must hold the rendered QR bitmap in Identifiable state."
        )
        XCTAssertTrue(
            source.contains(".sheet(item: $qrShareImage)"),
            "The QR share sheet must be presented via .sheet(item:) so SwiftUI anchors the " +
            "iPad popover and presents against the view's own scene."
        )
        XCTAssertTrue(
            source.contains("ShareSheet(activityItems: [qr.image])"),
            "It must reuse the shared ShareSheet representable."
        )
        XCTAssertFalse(
            source.contains("func presentVC"),
            "The hand-rolled presentVC(_:) helper must be gone."
        )
    }

    // MARK: - Single-source-of-truth lock

    /// Locks the convergence: no converged file may reintroduce a manual share
    /// presentation. The remaining `UIActivityViewController` uses in the app
    /// are all `UIViewControllerRepresentable` wrappers presented inside a
    /// SwiftUI `.sheet` (`ShareSheet`, `ActivityView`, `MediaShareSheet`),
    /// which is exactly the pattern these iterations converge on.
    func test_convergedFiles_containNoManualActivityPresentation() throws {
        for path in Self.convergedFiles {
            let source = try source(path)
            let code = source
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")

            XCTAssertFalse(
                code.contains("UIActivityViewController("),
                "\(path) must not construct a UIActivityViewController — use ShareSheet in a .sheet."
            )
            XCTAssertFalse(
                code.contains("popoverPresentationController"),
                "\(path) must not configure a popover anchor by hand — SwiftUI's .sheet does it."
            )
            XCTAssertFalse(
                code.contains("connectedScenes.first as? UIWindowScene"),
                "\(path) must not resolve a presenter from connectedScenes.first: connectedScenes " +
                "is an unordered Set, so .first can return a background scene."
            )
        }
    }
}
