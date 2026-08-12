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

    /// Regression 2026-07-09: with `swapStreams == true` (user tapped the PiP
    /// to make their own camera the full-screen primary), if the survival
    /// controller then drops the outbound track (`hasLocalVideoTrack` flips to
    /// false — weak network / thermal downgrade), the primary stream call site
    /// rendered `videoStream(local: swapStreams, …)` unconditionally with a nil
    /// `localVideoTrack`. `CallVideoView` has no dedicated fallback for `local:
    /// true` (unlike `local: false`, which degrades to a camera-off/connecting
    /// placeholder), so it fell into its generic "unexpected track" branch: a
    /// full-screen black "Video non disponible" placeholder — even though the
    /// peer's video was perfectly healthy. Worse, the PiP (the only element
    /// with the tap-to-swap gesture) was replaced by `localVideoSuspendedTile`,
    /// which has no gesture, so the user was stuck on the broken full-screen
    /// view until their own network recovered. Fix: gate the swap on local
    /// track availability so the primary self-heals back to the peer's video.
    func test_primaryStream_neverShowsUnavailableLocalTrack_whenLocalVideoSuspendedMidSwap() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("swapStreams && callManager.hasLocalVideoTrack"),
            "CallView must gate which stream is primary on local-track " +
            "availability (`effectiveSwapStreams`), so losing the outbound " +
            "track while swapped auto-reverts the primary to the peer's video " +
            "instead of rendering CallVideoView's generic nil-track fallback " +
            "full-screen."
        )
        XCTAssertFalse(
            source.contains("videoStream(local: swapStreams,"),
            "The primary stream call site must use `effectiveSwapStreams`, " +
            "not the raw `swapStreams` binding — the raw binding stays true " +
            "even after the local track disappears, showing a broken " +
            "full-screen placeholder over a healthy peer feed."
        )
        XCTAssertFalse(
            source.contains("videoStream(local: !swapStreams,"),
            "The PiP stream call site must mirror the primary via " +
            "`!effectiveSwapStreams`, not the raw `!swapStreams` binding, or " +
            "the two surfaces fall out of sync when the local track drops."
        )
    }
}
