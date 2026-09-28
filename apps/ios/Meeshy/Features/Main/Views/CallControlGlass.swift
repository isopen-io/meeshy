import SwiftUI
import MeeshyUI

// MARK: - Liquid Glass (product styling over the SDK Compatibility wrappers)

/// These are thin, app-side *styling* helpers: they encode Meeshy's product
/// choices (circle diameter, active→tint, red hang-up) and delegate the version
/// gating to the SDK `Compatibility/` layer (`adaptiveGlass` /
/// `adaptiveGlassProminent` / `AdaptiveGlassContainer`), which owns the real
/// `#available(iOS 26.0, *)` and the pre-iOS-26 fallback.
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

    /// #8394 — le verre d'un GROUPE flottant qui ne porte AUCUN bouton de verre
    /// (bandeau de sous-titres, puce de durée, légende de la scène). Un voile
    /// sombre sous le contenu garde le verre lisible sur une image claire
    /// (écran partagé, document filmé).
    func callChromeGlass<S: Shape>(in shape: S) -> some View {
        self
            .background(shape.fill(Color.black.opacity(0.22)))
            .adaptiveGlass(in: shape)
    }

    /// #8459 — la pilule d'appel est UN bloc de verre réel (`glassEffect`
    /// sous iOS 26, matériau avant) : les boutons Plus · Micro · Sortie · Fin
    /// ET les actions déployées du (…) vivent dedans. Ses boutons sont des
    /// disques plats (`CallButtonFill`) — le verre ne sait pas échantillonner
    /// le verre. Un voile sombre dessous garde les légendes lisibles sur une
    /// image claire (écran partagé, document filmé).
    func callControlsGlass<S: Shape>(in shape: S) -> some View {
        self
            .background(shape.fill(Color.black.opacity(0.18)))
            .adaptiveGlass(in: shape)
    }

    /// #8394 — le masquage automatique (vidéo, 4 s) retire ENSEMBLE la
    /// pilule, les actions et l'en-tête : invisibles, ils ne captent plus rien,
    /// ni un toucher ni VoiceOver.
    func callChromeVisibility(_ isVisible: Bool) -> some View {
        self
            .opacity(isVisible ? 1 : 0)
            .allowsHitTesting(isVisible)
            .accessibilityHidden(!isVisible)
            .animation(.easeInOut(duration: 0.25), value: isVisible)
    }
}

/// #8459 — le disque d'UN bouton du bloc de verre, selon son état : neutre
/// translucide, blanc plein quand il est actif, rouge pour Fin. Aucun verre
/// propre : le bouton est DANS le verre.
enum CallButtonFill {
    static func color(for kind: CallPillButtonKind) -> Color {
        switch kind {
        case .normal, .warning: return Color.white.opacity(0.16)
        case .active: return .white
        case .destructive: return MeeshyColors.error
        }
    }
}
