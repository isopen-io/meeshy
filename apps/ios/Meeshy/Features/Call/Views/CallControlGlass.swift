import SwiftUI
import MeeshyUI
import MeeshySDK

// MARK: - Liquid Glass (product styling over the SDK Compatibility wrappers)

/// These are thin, app-side *styling* helpers: they encode Meeshy's product
/// choices (circle diameter, active→tint, red hang-up) and delegate the version
/// gating to the SDK `Compatibility/` layer (`adaptiveLiquidGlass` /
/// `adaptiveGlassProminent` / `AdaptiveGlassContainer`), which owns the real
/// `#available(iOS 26.0, *)` and the pre-iOS-26 fallback.
enum CallControlGlassMetrics {
    /// La distance sous laquelle deux verres voisins se fondent (iOS 26). Les
    /// boutons d'un appel sont espacés de plus : ils se composent ensemble sans
    /// jamais se confondre.
    static let containerSpacing: CGFloat = MeeshySpacing.sm
}

extension View {
    /// #17323 — Liquid Glass interactif sous iOS 26, verre dessiné avant. Active
    /// state tints the glass; inactive renders plain glass.
    func callControlGlass(diameter: CGFloat, isActive: Bool, tint: Color) -> some View {
        self
            .frame(width: diameter, height: diameter)
            .adaptiveLiquidGlass(in: Circle(), tint: isActive ? tint.opacity(MeeshyOpacity.strong) : nil, interactive: true)
    }

    /// #8742 — une puce d'ambiance du Montage : la même capsule de verre
    /// interactive, teintée quand elle est choisie.
    func callChipGlass(isActive: Bool, tint: Color) -> some View {
        adaptiveLiquidGlass(in: Capsule(), tint: isActive ? tint.opacity(MeeshyOpacity.strong) : nil, interactive: true)
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
    /// ET les actions déployées du (…) vivent dedans. #17323 — chacun de ces
    /// boutons est lui-même un verre (`CallButtonGlassModifier`), composé avec ses
    /// voisins dans un `AdaptiveGlassContainer`. Un voile sombre dessous garde
    /// les légendes lisibles sur une image claire (écran partagé, document
    /// filmé).
    func callControlsGlass<S: Shape>(in shape: S) -> some View {
        self
            .background(shape.fill(Color.black.opacity(MeeshyOpacity.light)))
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
        // Au terme du fondu, le contenu est RETIRÉ du rendu, pas seulement
        // rendu transparent : dans un `GlassEffectContainer` (iOS 26) le verre
        // est composé par le conteneur, qui ignore l'opacité de ses enfants.
        // La pilule restait donc dessinée après le masquage automatique —
        // visible mais sourde : le premier toucher sur « Micro » ne faisait
        // que rallumer le chrome (simulateur). `hidden` garde
        // sa place dans la mise en page : rien ne saute.
        Group {
            if accepts {
                content
            } else {
                content.hidden()
            }
        }
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
                guard await cancellableSleep(for: .nanoseconds(CallChromeVisibility.fadeDurationNanoseconds)), !Task.isCancelled else { return }
                clock = Date()
            }
    }
}

/// #17323 — le verre d'UN bouton : `CallButtonGlassRule` choisit son
/// traitement. Fin garde son verre rouge (`adaptiveGlassProminent`), tout autre
/// bouton est un verre neutre, adossé à un blanc plein quand il est actif.
struct CallButtonGlassModifier: ViewModifier {
    let kind: CallPillButtonKind

    @ViewBuilder
    func body(content: Content) -> some View {
        let treatment = CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: Platform.isIOS26OrLater)
        switch treatment.surface {
        case .prominentRed:
            content.adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error, interactive: treatment.isInteractive)
        case .liquidGlass:
            content
                .adaptiveLiquidGlass(in: Circle(), interactive: treatment.isInteractive)
                .background(treatment.hasSolidWhiteBacking ? Color.white : Color.clear, in: Circle())
        }
    }
}

/// #17323 — une capsule d'en-tête qui s'ouvre au toucher (la qualité du
/// lien) : le voile sombre de `callChromeGlass`, sous un verre interactif.
struct CallInteractiveChromeGlass<S: Shape>: ViewModifier {
    let shape: S

    func body(content: Content) -> some View {
        content
            .background(shape.fill(Color.black.opacity(0.22)))
            .adaptiveLiquidGlass(in: shape, interactive: true)
    }
}

/// #8735 — sous le doigt, le verre dessiné (avant iOS 26) s'éclaircit : le
/// retour se voit, même sans rétrécissement. Sous iOS 26 le verre interactif
/// réagit seul (`CallButtonGlassRule.drawsPressHighlight`).
enum CallButtonFill {
    static func pressedHighlight(isPressed: Bool) -> Color {
        Color.white.opacity(isPressed ? 0.22 : 0)
    }
}
