import SwiftUI
import MeeshySDK

/// Le VOILE d'un message protégé, et ce qu'il DIT (#7452).
///
/// ## Ce qu'il corrige
///
/// Un texte à vue unique s'affichait **en clair, sans aucune mention** : le
/// masquage ne dépendait que de `isBlurred` (`FocalRow`, `BubbleStandardLayout`,
/// `BubbleContentBuilder`), et « Voir une fois » n'existait que sur les médias.
/// La protection la plus forte du produit était donc la seule qui ne se voyait
/// pas — un lecteur consommait sa vue unique sans avoir jamais choisi de le
/// faire, et sans savoir qu'il venait de le faire.
///
/// ## Pourquoi un libellé VISIBLE, et pas seulement un flou
///
/// Un flou nu se lit « contenu masqué » : il ne dit pas que le regarder le
/// DÉTRUIT. Le voile d'une vue unique porte donc son libellé en clair —
/// « Vue unique · touchez pour afficher » — à parité avec le web. Le toucher
/// est le consentement ; c'est lui qui appelle `/consume`, chez l'hôte.
///
/// Composant de SDK : il ne connaît ni message, ni réseau, ni singleton. Il
/// reçoit deux primitives et une fermeture.
public struct ProtectedVeilAffordance: View, Equatable {

    public let isViewOnce: Bool
    public let isDark: Bool
    /// Ce que fait le toucher, dit à VoiceOver (#8009) — l'hôte le sait, le
    /// voile non : « ouvrir en plein écran » pour un média caché, « afficher en
    /// clair » pour un texte. `nil` ⇒ l'indice générique du voile.
    public let hint: String?
    private let onReveal: () -> Void
    /// Durée de la pression qui se relâche sur le voile (#8017) — un appui long
    /// ouvre le menu du message, son relâcher ne doit rien dévoiler derrière.
    @State private var press = ProtectedVeilPressClock()

    public init(isViewOnce: Bool, isDark: Bool, hint: String? = nil, onReveal: @escaping () -> Void) {
        self.isViewOnce = isViewOnce
        self.isDark = isDark
        self.hint = hint
        self.onReveal = onReveal
    }

    public static func == (lhs: ProtectedVeilAffordance, rhs: ProtectedVeilAffordance) -> Bool {
        lhs.isViewOnce == rhs.isViewOnce && lhs.isDark == rhs.isDark && lhs.hint == rhs.hint
    }

    public var body: some View {
        // `Button` + `.contentShape`, jamais un `.onTapGesture` nu : un
        // geste nu serait avalé par l'appui long du conteneur de message.
        Button(action: releaseOnVeil) {
            ZStack {
                Color.clear
                if isViewOnce {
                    // Le pictogramme de la vue unique vit dans le chrome, en
                    // violet, juste au-dessus (#7599) : le voile ne le répète
                    // pas, il offre le GESTE.
                    Text(Self.viewOnceVeilLabel)
                        .font(.caption.weight(.semibold))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .foregroundColor(isDark ? .white.opacity(0.92) : .black.opacity(0.85))
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(
                            Capsule().fill(.ultraThinMaterial)
                        )
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(ProtectedVeilPressStyle(clock: press))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isViewOnce ? Self.viewOnceVeilLabel : Self.hiddenLabel)
        .accessibilityHint(hint ?? (isViewOnce ? Self.viewOnceVeilHint : Self.hiddenHint))
    }

    private func releaseOnVeil() {
        let duration = press.pressDuration(endingAt: Date())
        press.reset()
        guard ProtectedVeilPressLaw.reveals(pressDuration: duration) else { return }
        onReveal()
    }

    // MARK: - Libellés (catalogue MeeshyUI, 7 langues)

    public static var viewOnceVeilLabel: String {
        String(localized: "protection.veil.view_once",
               defaultValue: "Vue unique · touchez pour afficher", bundle: .module)
    }

    public static var viewOnceVeilHint: String {
        String(localized: "protection.veil.view_once.hint",
               defaultValue: "Le message ne s'affichera qu'une fois", bundle: .module)
    }

    public static var hiddenLabel: String {
        String(localized: "protection.veil.hidden", defaultValue: "Contenu masqué", bundle: .module)
    }

    public static var hiddenHint: String {
        String(localized: "protection.veil.hidden.hint",
               defaultValue: "Toucher pour révéler le contenu", bundle: .module)
    }
}

// MARK: - Le relâcher d'un appui long ne dévoile rien (#8017)

/// **Seul un TOUCHER dévoile un contenu protégé.** L'appui long du message
/// (`LongPressGesture(0.35)`, posé EN SIMULTANÉ par la cellule) ouvre son menu ;
/// le `Button` du voile, lui, partait quand même au relâcher et levait le flou
/// pendant 5 s DERRIÈRE le menu — un dévoilement sans toucher volontaire.
/// Une pression qui a duré le temps d'un appui long n'est pas un toucher.
public nonisolated enum ProtectedVeilPressLaw {
    /// Durée à partir de laquelle la cellule ouvre le menu du message.
    public static let longPressThreshold: TimeInterval = 0.35

    /// `nil` = pression non mesurée (toucher plus bref qu'une image) : c'est un toucher.
    public static func reveals(pressDuration: TimeInterval?) -> Bool {
        guard let pressDuration else { return true }
        return pressDuration < longPressThreshold
    }
}

/// Horloge de la pression en cours sur le voile, alimentée par `isPressed`.
/// Une pression ANNULÉE (doigt sorti) laisse une mesure orpheline : au-delà de
/// `staleAfter` après son relâcher, elle ne qualifie plus le toucher suivant.
public final class ProtectedVeilPressClock {
    // MeeshyUI compile sous isolation MainActor par défaut : la deinit
    // synthétisée y est ISOLÉE et tue xctest au démontage (iOS 18.4+/26,
    // Swift #85663). Garde : MeeshyUIDeinitSourceGuardTests + passe binaire.
    nonisolated deinit {}

    public static let staleAfter: TimeInterval = 0.5

    private var began: Date?
    private var released: Date?

    public init() {}

    public func pressChanged(isPressed: Bool, at now: Date) {
        if isPressed {
            began = now
            released = nil
        } else {
            released = now
        }
    }

    public func pressDuration(endingAt now: Date) -> TimeInterval? {
        guard let began else { return nil }
        let end = released ?? now
        guard now.timeIntervalSince(end) <= Self.staleAfter else { return nil }
        return end.timeIntervalSince(began)
    }

    public func reset() {
        began = nil
        released = nil
    }
}

/// Style neutre (comme `.plain`, sans atténuation) qui RAPPORTE la pression.
struct ProtectedVeilPressStyle: ButtonStyle {
    let clock: ProtectedVeilPressClock

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .adaptiveOnChange(of: configuration.isPressed) { _, isPressed in
                clock.pressChanged(isPressed: isPressed, at: Date())
            }
    }
}
