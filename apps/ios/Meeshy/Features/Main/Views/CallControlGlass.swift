import SwiftUI
import MeeshyUI

// MARK: - Liquid Glass (product styling over the SDK Compatibility wrappers)

/// These are thin, app-side *styling* helpers: they encode Meeshy's product
/// choices (circle diameter, active→tint, red hang-up) and delegate the version
/// gating to the SDK `Compatibility/` layer (`adaptiveGlass` /
/// `adaptiveGlassProminent` / `AdaptiveGlassContainer`), which owns the real
/// `#available(iOS 26.0, *)` and the pre-iOS-26 fallback.
///
/// ONE exception, `CallGlassMorphModifier` below: the SDK wraps `glassEffect`
/// but not `glassEffectID`, the identity that lets a button of the actions
/// morph out of the `(…)` glass (#8432). It carries its own gate, and only
/// that one.
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

    /// #8432 — le fond d'un groupe de BOUTONS DE VERRE (la pilule, les
    /// actions déployées). Chaque bouton porte son propre verre : un verre de
    /// groupe dessous ferait du verre sur verre, que le verre ne sait pas
    /// échantillonner. Il reste un voile NON VITRÉ, pour la lisibilité des
    /// légendes sur une image claire.
    func callLegibilityVeil<S: Shape>(in shape: S) -> some View {
        background(shape.fill(Color.black.opacity(0.22)))
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

    /// #8432 — nomme le verre d'un bouton pour que, sous iOS 26, les actions
    /// naissent du `(…)` et y retournent. Le nom descend par l'environnement
    /// jusqu'au glyphe qui porte le verre (`CallPillGlyph`).
    func callGlassMorph(id: String, in namespace: Namespace.ID) -> some View {
        environment(\.callGlassMorph, CallGlassMorphTag(id: id, namespace: namespace))
    }
}

/// #8432 — le verre d'UN bouton de l'écran d'appel, selon son état : verre
/// interactif par défaut, verre prominent PLEIN quand le bouton est actif, rouge
/// prominent pour Fin.
struct CallButtonGlass: ViewModifier {
    let kind: CallPillButtonKind

    func body(content: Content) -> some View {
        switch kind {
        case .normal, .warning:
            content.adaptiveGlass(in: Circle(), interactive: true)
        case .active:
            content.adaptiveGlassProminent(in: Circle(), tint: .white)
        case .destructive:
            content.adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)
        }
    }
}

/// L'identité de verre d'un bouton : un nom dans l'espace de noms de l'écran.
struct CallGlassMorphTag {
    let id: String
    let namespace: Namespace.ID
}

private struct CallGlassMorphKey: EnvironmentKey {
    static var defaultValue: CallGlassMorphTag? { nil }
}

extension EnvironmentValues {
    var callGlassMorph: CallGlassMorphTag? {
        get { self[CallGlassMorphKey.self] }
        set { self[CallGlassMorphKey.self] = newValue }
    }
}

/// Sous iOS 26 : `glassEffectID`, le verre se déforme d'un bouton à l'autre.
/// Avant iOS 26, et toujours avec Réduire les animations : aucune identité,
/// le groupe qui apparaît se contente de son fondu (`.transition(.opacity)`
/// posé par la pilule) — rien ne se déplace.
struct CallGlassMorphModifier: ViewModifier {
    let tag: CallGlassMorphTag?
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if let tag, !reduceMotion {
                content.glassEffectID(tag.id, in: tag.namespace)
            } else {
                content
            }
        } else {
            content
        }
    }
}
