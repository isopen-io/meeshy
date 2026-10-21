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
            let frame = geo.frame(in: .global)
            let center = FeedButtonAnchor.unitPoint(
                fromRaw: feedButtonPositionRaw,
                geometry: floatingGeometry
                    ?? FloatingButtonGeometry.measured(container: frame, safeRegion: frame, reported: geo.safeAreaInsets),
                in: frame
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

// MARK: - Feed Button Anchor (pure mapping)

/// Le centre du bouton Flux, d'où naît le disque des réels : lu dans
/// `FloatingButtonGeometry.layout`, la source que le conteneur des boutons
/// emploie pour le poser (#9679) — le disque naît au centre EXACT du bouton.
enum FeedButtonAnchor {
    static func screenPoint(fromRaw raw: String, geometry: FloatingButtonGeometry) -> CGPoint {
        geometry.center(forStorage: raw, default: FloatingButtonGeometry.defaultFeedStorage)
    }

    /// Le centre du bouton (global) en fraction du cadre GLOBAL `frame` de la
    /// vue qui révèle les réels — qui peut, comme le conteneur des boutons, ne
    /// pas commencer en haut de l'écran (bannière du joueur).
    static func unitPoint(fromRaw raw: String, geometry: FloatingButtonGeometry, in frame: CGRect) -> UnitPoint {
        guard frame.width > 0, frame.height > 0 else { return .topLeading }
        let p = screenPoint(fromRaw: raw, geometry: geometry)
        return UnitPoint(x: (p.x - frame.minX) / frame.width, y: (p.y - frame.minY) / frame.height)
    }
}

// MARK: - Sous les réels, rien ne travaille (#10354)

/// **Les réels RECOUVRENT l'écran** : le disque d'ouverture a fini de grandir
/// et la fermeture n'a pas commencé. La liste et le fil restent montés dessous
/// (leur état, leur défilement), mais n'ont plus rien à montrer.
nonisolated enum ReelsCover {
    static func isCovered(hasLaunch: Bool, revealCompleted: Bool) -> Bool {
        hasLaunch && revealCompleted
    }
}

/// **Un sous-arbre que les réels recouvrent ne se réévalue plus par son parent.**
///
/// Profilé sur l'iPhone 16 Pro Max (build Release, 2026-10-12) pendant des
/// balayages de réels : `MeeshyAvatar.body` et `StoryCoverURLMemo.coverURL`
/// (≈ 2 % chacun) — la liste des conversations, montée SOUS la couche des
/// réels, se réévaluait à chaque rendu de `RootView`, dont elle reçoit des
/// fermetures et des liaisons qu'aucune comparaison ne déclare égales.
///
/// Monté avec `.equatable()` : deux valeurs RECOUVERTES sont égales, le corps
/// n'est pas réévalué et ses enfants gardent ce qu'ils ont. Au moindre
/// découvrement (fermeture des réels), l'égalité tombe et le sous-arbre se
/// remet à jour avec les valeurs du moment. Ce que le sous-arbre observe
/// lui-même (ses propres modèles) n'est pas retenu : c'est une donnée vraie.
struct CoveredFreeze<Content: View>: View, Equatable {
    let isCovered: Bool
    let content: Content

    init(isCovered: Bool, @ViewBuilder content: () -> Content) {
        self.isCovered = isCovered
        self.content = content()
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isCovered && rhs.isCovered
    }

    var body: some View { content }
}
