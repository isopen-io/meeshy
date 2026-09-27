import SwiftUI
import MeeshyUI

// MARK: - Liquid Glass (product styling over the SDK Compatibility wrappers)

/// These are thin, app-side *styling* helpers: they encode Meeshy's product
/// choices (circle diameter, active→tint, red hang-up) and delegate the version
/// gating to the SDK `Compatibility/` layer (`adaptiveGlass` /
/// `adaptiveGlassProminent` / `AdaptiveGlassContainer`), which owns the real
/// `#available(iOS 26.0, *)` and the pre-iOS-26 fallback. No `#available` lives
/// in the app — same rule as every other adaptive wrapper.
extension View {
    /// Regular Liquid Glass circle for a neutral/secondary control. Active state
    /// tints the glass; inactive renders plain glass (clear / material fallback).
    func callControlGlass(diameter: CGFloat, isActive: Bool, tint: Color) -> some View {
        self
            .frame(width: diameter, height: diameter)
            .adaptiveGlass(in: Circle(), tint: isActive ? tint.opacity(0.55) : nil, interactive: true)
    }

    /// Prominent red Liquid Glass circle for the hang-up button.
    func endCallGlass(diameter: CGFloat) -> some View {
        self
            .frame(width: diameter, height: diameter)
            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)
    }

    /// #8394 — le verre d'un GROUPE flottant de l'écran d'appel (pilule, rail,
    /// bandeau de sous-titres, puce de durée) : un verre par groupe, les
    /// boutons qu'il porte n'en ont pas. Un voile sombre sous le contenu garde
    /// le verre lisible sur une image claire (écran partagé, document filmé) :
    /// sous iOS 26 il teinte le verre adaptatif, avant iOS 26 il assombrit le
    /// matériau de repli.
    func callChromeGlass<S: Shape>(in shape: S) -> some View {
        self
            .background(shape.fill(Color.black.opacity(0.22)))
            .adaptiveGlass(in: shape)
    }

    /// #8394 — le masquage automatique (vidéo, 4 s) retire ENSEMBLE la
    /// pilule, les rails et l'en-tête : invisibles, ils ne captent plus rien,
    /// ni un toucher ni VoiceOver.
    func callChromeVisibility(_ isVisible: Bool) -> some View {
        self
            .opacity(isVisible ? 1 : 0)
            .allowsHitTesting(isVisible)
            .accessibilityHidden(!isVisible)
            .animation(.easeInOut(duration: 0.25), value: isVisible)
    }
}
