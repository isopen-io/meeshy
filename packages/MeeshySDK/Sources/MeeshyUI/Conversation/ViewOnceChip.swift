import SwiftUI
import MeeshySDK

/// **La puce d'une vue unique** — `(1) · Touchez pour afficher` (#7618, #7619).
///
/// Directive porteur du 2026-09-23 : le « 1 » cerclé REMPLACE le mot « Vue
/// unique ». Une seule puce, sur une ligne, jamais tronquée ; pas de voile posé
/// sur un contenu monté, pas de pictogramme répété au-dessus. Une vue unique
/// non ouverte ne montre QUE cette puce : son contenu n'est pas dans le rendu,
/// ni pour l'œil ni pour le lecteur d'écran.
///
/// Composant de SDK : il ne connaît ni message ni réseau. Il reçoit l'état, le
/// thème et le geste d'ouverture, que l'hôte route (plein écran pour un média,
/// lecture sur place pour un texte).
public struct ViewOnceChip: View, Equatable {

    public enum State: Equatable, Sendable {
        /// Pas encore ouverte : le geste l'ouvre.
        case sealed
        /// Déjà ouverte par ce lecteur (#7579) : même puce, fond MOINS
        /// prononcé, `(1) · Déjà ouvert`. Permanent, sans contenu à rouvrir.
        case opened
    }

    public let state: State
    public let isDark: Bool
    private let onOpen: () -> Void

    public init(state: State, isDark: Bool, onOpen: @escaping () -> Void) {
        self.state = state
        self.isDark = isDark
        self.onOpen = onOpen
    }

    public static func == (lhs: ViewOnceChip, rhs: ViewOnceChip) -> Bool {
        lhs.state == rhs.state && lhs.isDark == rhs.isDark
    }

    public var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 6) {
                Image(systemName: state == .sealed
                      ? MessageProtectionSymbols.viewOnceFilled
                      : MessageProtectionSymbols.viewOnce)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(MeeshyColors.stateViewOnce.opacity(state == .sealed ? 1 : 0.6))
                Text(verbatim: "·")
                    .foregroundColor(labelColor.opacity(0.6))
                Text(Self.label(for: state))
                    .foregroundColor(labelColor)
            }
            .font(.footnote.weight(.semibold))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(MeeshyColors.stateViewOnce.opacity(Self.fillOpacity(for: state, isDark: isDark)))
                    .overlay(Capsule().stroke(
                        MeeshyColors.stateViewOnce.opacity(state == .sealed ? 0.45 : 0.2), lineWidth: 0.75
                    ))
            )
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(for: state))
        .accessibilityAddTraits(state == .sealed ? .isButton : .isStaticText)
        .allowsHitTesting(state == .sealed)
    }

    private var labelColor: Color {
        let base: Color = isDark ? .white : .black
        return base.opacity(state == .sealed ? (isDark ? 0.92 : 0.82) : 0.55)
    }

    /// Le fond de la puce : plein avant l'ouverture, MOINS prononcé après
    /// (directive porteur 2026-09-23).
    public static func fillOpacity(for state: State, isDark: Bool) -> Double {
        switch state {
        case .sealed: return isDark ? 0.24 : 0.16
        case .opened: return isDark ? 0.08 : 0.05
        }
    }

    // MARK: - Libellés (catalogue MeeshyUI, 7 langues)

    public static func label(for state: State) -> String {
        switch state {
        case .sealed:
            return String(localized: "protection.view_once.chip.sealed",
                          defaultValue: "Touchez pour afficher", bundle: .module)
        case .opened:
            return String(localized: "protection.view_once.chip.opened",
                          defaultValue: "Déjà ouvert", bundle: .module)
        }
    }

    public static func accessibilityLabel(for state: State) -> String {
        switch state {
        case .sealed:
            return String(localized: "protection.view_once.chip.sealed.a11y",
                          defaultValue: "Message à vue unique, touchez pour afficher", bundle: .module)
        case .opened:
            return String(localized: "protection.view_once.chip.opened.a11y",
                          defaultValue: "Message à vue unique, déjà ouvert", bundle: .module)
        }
    }
}
