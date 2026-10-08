import SwiftUI
import MeeshyUI

// MARK: - Reels Liquid Reveal Container

/// Masks the immersive reels view with a `LiquidRevealShape` (water-wave
/// circular reveal) born at the feed button's exact on-screen position. The
/// REAL first reel is visible inside the disc from the small-disc state onward
/// (we mask the live view, not a placeholder). Under Reduce Motion the wavy
/// mask is swapped for a plain cross-fade — still roughly honoring the origin.
///
/// Extrait de `RootView.swift` (#9702), hors budget : on extrait d'abord, on
/// corrige ensuite.
struct ReelsRevealContainer<Content: View>: View {
    let revealProgress: Double
    /// When `false`, the mask is dropped entirely so the live `AVPlayer` surface
    /// renders (a persistent mask over an AVPlayer layer freezes it on the poster).
    /// RootView flips it off once the disc reaches full screen.
    let applyMask: Bool
    /// The feed button position as persisted by RootView.
    let feedButtonPositionRaw: String
    /// The geometry the floating buttons were laid out with (#9679).
    let floatingGeometry: FloatingButtonGeometry?
    let reduceMotion: Bool
    /// Receives the REAL safe-area insets (read before `.ignoresSafeArea()`) so
    /// the reels chrome (back button, scrub bar) can clear the Dynamic Island /
    /// home indicator while the media stays full-bleed.
    @ViewBuilder let content: (EdgeInsets) -> Content

    /// A continuously flowing phase so the liquid edge "ripples" while expanding.
    @State private var wavePhase: Double = 0

    var body: some View {
        GeometryReader { geo in
            let center = FeedButtonAnchor.unitPoint(
                fromRaw: feedButtonPositionRaw,
                geometry: floatingGeometry ?? FloatingButtonGeometry(screenSize: geo.size, safeArea: geo.safeAreaInsets)
            )

            content(geo.safeAreaInsets)
                .ignoresSafeArea()
                .modifier(
                    ReelsRevealMaskModifier(
                        revealProgress: revealProgress,
                        applyMask: applyMask,
                        center: center,
                        wavePhase: wavePhase,
                        reduceMotion: reduceMotion
                    )
                )
        }
        .ignoresSafeArea()
        .onAppear { setWaveFlowing(applyMask) }
        // La vague ne coule que tant que le masque existe (#9702) : une fois le
        // disque plein écran, la transaction `repeatForever` continuait de
        // tourner pour une forme qui n'était plus montée. Elle repart au
        // masque de fermeture.
        .adaptiveOnChange(of: applyMask) { _, masked in setWaveFlowing(masked) }
        .onDisappear { setWaveFlowing(false) }
    }

    private func setWaveFlowing(_ flowing: Bool) {
        guard flowing, !reduceMotion else {
            // Une écriture SANS animation remplace la transaction répétée :
            // c'est ce qui l'arrête.
            withTransaction(Transaction(animation: nil)) { wavePhase = 0 }
            return
        }
        withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) {
            wavePhase = 2 * .pi
        }
    }
}

/// Applies the reveal mask. Split out so the wavy-vs-fade branch reads cleanly.
/// Once `applyMask` is false (disc full screen) the content renders untouched so
/// the AVPlayer surface is live.
struct ReelsRevealMaskModifier: ViewModifier {
    let revealProgress: Double
    let applyMask: Bool
    let center: UnitPoint
    let wavePhase: Double
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        if !applyMask {
            content
        } else if reduceMotion {
            // Plain cross-fade honoring the origin loosely (no wavy edge).
            content.opacity(revealProgress)
        } else {
            content.mask(
                LiquidRevealShape(
                    center: center,
                    progress: revealProgress,
                    baseRadius: 26,           // feed button radius (52pt circle)
                    amplitude: 16,
                    frequency: 9,
                    phase: wavePhase
                )
                .ignoresSafeArea()
            )
        }
    }
}
