import XCTest
@testable import Meeshy

/// Source-analysis guards for CallView layout integrity.
///
/// Regression 2026-07-03 (repro simulateur) : le backdrop « bannière du
/// contact » (`CachedAsyncImage` + `.scaledToFill()`) posé directement dans
/// le ZStack racine RÉPONDAIT sa largeur débordante (~1 400 pt pour une
/// bannière paysage). Le ZStack racine adoptait cette largeur : tout l'écran
/// d'appel se décalait de +30 pt vers la droite et le chevron minimize était
/// expulsé hors écran (x ≈ −475). L'image doit vivre dans un `.overlay` d'un
/// `Color.clear` (layout-neutre) et être `.clipped()`.
@MainActor
final class CallViewLayoutGuardTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le backdrop plein écran doit être confiné dans un overlay layout-neutre.
    func test_remoteBackdrop_isLayoutNeutral_overlayOnColorClear() throws {
        let source = try callViewSource()
        guard let backdropRange = source.range(of: "let backdrop = remoteBackdropURL") else {
            XCTFail("CallView must render the remote-profile backdrop (remoteBackdropURL)")
            return
        }
        let end = source.index(backdropRange.lowerBound, offsetBy: 1600, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[backdropRange.lowerBound ..< end])
        XCTAssertTrue(
            block.contains("Color.clear") && block.contains(".overlay"),
            "The full-page profile backdrop must be hosted as `.overlay` of a " +
            "`Color.clear` so its oversized fill NEVER inflates the root ZStack " +
            "layout (a landscape banner shifted the whole call screen +30 pt " +
            "and pushed the minimize chevron off-screen)."
        )
        XCTAssertTrue(
            block.contains(".clipped()"),
            "The backdrop overlay must stay .clipped() to the screen bounds."
        )
    }

    /// Interdit le retour du pattern fautif : `.scaledToFill()` appliqué au
    /// `CachedAsyncImage` du backdrop AVANT tout confinement en overlay.
    func test_remoteBackdrop_neverScaledToFillAsDirectZStackChild() throws {
        let source = try callViewSource()
        guard let backdropRange = source.range(of: "let backdrop = remoteBackdropURL") else {
            XCTFail("CallView must render the remote-profile backdrop (remoteBackdropURL)")
            return
        }
        let end = source.index(backdropRange.lowerBound, offsetBy: 1600, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[backdropRange.lowerBound ..< end])
        if let overlayPos = block.range(of: ".overlay"),
           let fillPos = block.range(of: ".scaledToFill()") {
            XCTAssertTrue(
                overlayPos.lowerBound < fillPos.lowerBound,
                "`.scaledToFill()` must only appear INSIDE the layout-neutral " +
                "overlay — as a direct ZStack child it reports its overflowing " +
                "width and re-introduces the +30 pt call-screen shift."
            )
        }
    }

    /// Regression 2026-07-05: the call screen pins `.environment(\.colorScheme,
    /// .dark)` (white-on-dark chrome, see the comment right above it) so its
    /// glass materials always render their dark variant. `ThemeManager`'s
    /// `textPrimary`/`textMuted` are NOT environment-driven — they read the
    /// user's in-app Light/Dark/System preference directly — so any call site
    /// using them renders dark-on-near-black text whenever the app theme is
    /// Light, independently of the environment override. Every text label on
    /// this screen must use a static `.white`-based color instead.
    func test_neverUsesThemeManagerTextColors_wouldBeInvisibleInLightAppTheme() throws {
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains("theme.textPrimary") || source.contains("theme.textMuted"),
            "CallView text must never read ThemeManager.textPrimary/textMuted — " +
            "the screen's colorScheme is pinned to .dark for its glass chrome, " +
            "but those colors follow the user's app-level theme preference " +
            "regardless, so a Light-theme user would see near-invisible " +
            "dark-on-near-black text (remote name, call-ended reason, control " +
            "captions). Use `.white.opacity(...)` like every other label here."
        )
    }
}
