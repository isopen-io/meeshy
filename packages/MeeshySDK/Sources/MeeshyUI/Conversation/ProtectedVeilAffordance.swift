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
/// « Vue unique · touchez pour afficher » — à parité avec web-v2. Le toucher
/// est le consentement ; c'est lui qui appelle `/consume`, chez l'hôte.
///
/// Composant de SDK : il ne connaît ni message, ni réseau, ni singleton. Il
/// reçoit deux primitives et une fermeture.
public struct ProtectedVeilAffordance: View, Equatable {

    public let isViewOnce: Bool
    public let isDark: Bool
    private let onReveal: () -> Void

    public init(isViewOnce: Bool, isDark: Bool, onReveal: @escaping () -> Void) {
        self.isViewOnce = isViewOnce
        self.isDark = isDark
        self.onReveal = onReveal
    }

    public static func == (lhs: ProtectedVeilAffordance, rhs: ProtectedVeilAffordance) -> Bool {
        lhs.isViewOnce == rhs.isViewOnce && lhs.isDark == rhs.isDark
    }

    public var body: some View {
        // `Button(.plain)` + `.contentShape`, jamais un `.onTapGesture` nu : un
        // geste nu serait avalé par l'appui long du conteneur de message.
        Button(action: onReveal) {
            ZStack {
                Color.clear
                if isViewOnce {
                    HStack(spacing: 4) {
                        Image(systemName: MessageProtectionSymbols.viewOnceFilled)
                            .font(.caption.weight(.semibold))
                        Text(Self.viewOnceVeilLabel)
                            .font(.caption.weight(.semibold))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundColor(isDark ? .white.opacity(0.92) : .black.opacity(0.85))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(.ultraThinMaterial)
                    )
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isViewOnce ? Self.viewOnceVeilLabel : Self.hiddenLabel)
        .accessibilityHint(isViewOnce ? Self.viewOnceVeilHint : Self.hiddenHint)
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
