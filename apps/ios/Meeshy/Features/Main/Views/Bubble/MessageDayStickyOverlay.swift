import SwiftUI
import MeeshyUI

/// État réactif qui pilote l'affichage de la pill flottante « Aujourd'hui /
/// Hier / Lundi 9 mai » au top de la liste des messages. Sert de pont entre
/// `MessageListViewController` (UIKit : calcul du `dayStart` du message en
/// haut visible + détection du défilement actif via les délégués
/// `UIScrollView`) et l'overlay SwiftUI hébergé via `UIHostingController`.
@MainActor
final class MessageDayStickyState: ObservableObject {
    @Published var label: String? = nil
    /// True pendant que l'utilisateur fait défiler activement la liste (drag
    /// ou décélération). Seule fenêtre où la pill est autorisée à s'afficher
    /// — au repos, le header flottant reprend cette bande (exclusion mutuelle).
    @Published var isScrollingActive: Bool = false
    /// True quand le header de conversation est DÉPLIÉ (tap sur l'avatar ou
    /// l'icône de conversation). La pill se retire pour ne pas encombrer la vue.
    @Published var isHeaderExpanded: Bool = false
}

/// Overlay SwiftUI piné au top du collectionView : affiche le séparateur de
/// jour du message en haut visible pendant le défilement actif. Simple pill
/// posée sous l'îlot sans animation complexe — l'utilisateur voit juste le
/// label du jour changer au fil du scroll.
struct MessageDayStickyOverlay: View {
    @ObservedObject var state: MessageDayStickyState
    @Environment(\.colorScheme) private var colorScheme

    /// La pill n'a droit à la bande haute que quand personne d'autre ne la
    /// réclame : défilement en cours (le header flottant s'efface) ET header
    /// replié (sinon l'utilisateur regarde les détails de la conversation).
    private var isVisible: Bool {
        state.label != nil && state.isScrollingActive && !state.isHeaderExpanded
    }

    var body: some View {
        Group {
            if let label = state.label, isVisible {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(colorScheme == .dark ? MeeshyColors.indigo200 : MeeshyColors.indigo700)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(colorScheme == .dark ? MeeshyColors.indigo900 : MeeshyColors.indigo50)
                    .cornerRadius(20)
                    .padding(.top, 8)
                    .padding(.horizontal, 16)
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(.isHeader)
                    .id(label)
                    .transition(.opacity)
            }
        }
        .allowsHitTesting(false)
    }
}
