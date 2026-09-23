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
                Image(systemName: MessageProtectionSymbols.viewOnceFilled)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(MeeshyColors.stateViewOnce)
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
                    .fill(MeeshyColors.stateViewOnce.opacity(isDark ? 0.24 : 0.16))
                    .overlay(Capsule().stroke(MeeshyColors.stateViewOnce.opacity(0.45), lineWidth: 0.75))
            )
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(for: state))
        .accessibilityAddTraits(.isButton)
    }

    private var labelColor: Color {
        isDark ? .white.opacity(0.92) : .black.opacity(0.82)
    }

    // MARK: - Libellés (catalogue MeeshyUI, 7 langues)

    public static func label(for state: State) -> String {
        switch state {
        case .sealed:
            return String(localized: "protection.view_once.chip.sealed",
                          defaultValue: "Touchez pour afficher", bundle: .module)
        }
    }

    public static func accessibilityLabel(for state: State) -> String {
        switch state {
        case .sealed:
            return String(localized: "protection.view_once.chip.sealed.a11y",
                          defaultValue: "Message à vue unique, touchez pour afficher", bundle: .module)
        }
    }
}
