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
    /// ni un toucher ni VoiceOver. #8735 — « invisibles » s'entend au terme du
    /// fondu : tant qu'on les voit encore, ils répondent, et le toucher reçu
    /// pendant le fondu les rallume.
    func callChromeVisibility(_ isVisible: Bool) -> some View {
        modifier(CallChromeVisibilityModifier(isVisible: isVisible))
    }
}

/// La grâce du fondu (`CallChromeVisibility.acceptsTouches`) : le toucher
/// est coupé à la FIN de la disparition, jamais à son début — sinon le
/// bouton encore visible laissait passer le doigt jusqu'à la vidéo, qui ne
/// faisait que rallumer le chrome, et l'action ne partait jamais.
private struct CallChromeVisibilityModifier: ViewModifier {
    let isVisible: Bool

    @State private var hiddenAt: Date?
    @State private var clock = Date()
    @Environment(\.callChromeInteraction) private var reportInteraction

    private var acceptsTouches: Bool {
        CallChromeVisibility.acceptsTouches(
            isVisible: isVisible,
            hiddenFor: hiddenAt.map { clock.timeIntervalSince($0) } ?? .infinity
        )
    }

    func body(content: Content) -> some View {
        let accepts = acceptsTouches
        let isFadingOut = accepts && !isVisible
        content
            .opacity(isVisible ? 1 : 0)
            .simultaneousGesture(
                TapGesture().onEnded { reportInteraction?(.revive) },
                including: isFadingOut ? .all : .subviews
            )
            .allowsHitTesting(accepts)
            .accessibilityHidden(!isVisible)
            .animation(.easeInOut(duration: CallChromeVisibility.fadeDuration), value: isVisible)
            .adaptiveOnChange(of: isVisible) { _, visible in
                let now = Date()
                hiddenAt = visible ? nil : now
                clock = now
            }
            .task(id: hiddenAt) {
                guard hiddenAt != nil else { return }
                try? await Task.sleep(nanoseconds: CallChromeVisibility.fadeDurationNanoseconds)
                guard !Task.isCancelled else { return }
                clock = Date()
            }
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

    /// #8735 — sous le doigt, le disque s'éclaircit (0,16 → ~0,34 sur un
    /// disque neutre) : l'enfoncement se voit, même sans rétrécissement.
    static func pressedHighlight(isPressed: Bool) -> Color {
        Color.white.opacity(isPressed ? 0.22 : 0)
    }
}
