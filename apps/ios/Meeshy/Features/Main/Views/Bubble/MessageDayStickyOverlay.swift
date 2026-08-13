import SwiftUI
import Combine

/// Placement vertical de la pill sticky de jour dans le viewport de la liste.
///
/// La pill et la rangée du header flottant (retour + avatar + titre) se
/// disputaient la même bande, juste sous l'encoche / Dynamic Island — la
/// pill à `safeArea + 4` recouvrait le header (retour user 2026-08-12), d'où
/// un repli à +60 pour la faire démarrer SOUS lui. Résolu autrement le
/// lendemain (2026-08-13) : **exclusion mutuelle** plutôt qu'un grand offset
/// fixe. La pill n'est visible QUE pendant le défilement actif
/// (`MessageDayStickyState.isScrollingActive`), moment où `ConversationView`
/// masque le header flottant en retour (`onScrollingActiveChanged`) — les
/// deux ne sont donc plus jamais à l'écran en même temps, et la pill peut se
/// poser tout près de l'encoche. `IslandEmergingBanner` ajoute déjà ses
/// propres 8pt d'air sous l'îlot (`finalTopPadding`) dans son style posé :
/// l'offset ici reste à 0 pour ne pas les cumuler.
enum MessageDayStickyPlacement {
    nonisolated static let topOffset: CGFloat = 0
}

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
    /// — au repos, le header flottant reprend cette bande (exclusion
    /// mutuelle, voir `MessageDayStickyPlacement`).
    @Published var isScrollingActive: Bool = false
}

/// Overlay SwiftUI piné au top du collectionView : affiche le séparateur de
/// jour du message en haut visible pendant le défilement actif, avec
/// l'animation d'émergence/rétraction dans l'encoche (`IslandEmergingBanner`
/// — pattern déjà éprouvé par la bannière d'appel, jusqu'ici jamais monté).
/// Sur Dynamic Island : la pill sortante NOIRCIT et se rétracte dans l'îlot
/// avant que la nouvelle en ressorte, prenant sa forme, pour se poser
/// quelques pixels dessous. `.id(label)` force cette identité de vue
/// distincte à chaque changement de jour — sans lui, SwiftUI mettrait juste
/// le texte à jour en place, aucune transition ne rejouerait. Sans encoche
/// (notch classique/SE) ou sous Reduce Motion, `IslandEmergingBanner` bascule
/// seul sur son repli : pill noire statique, simple fondu.
struct MessageDayStickyOverlay: View {
    @ObservedObject var state: MessageDayStickyState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let label = state.label, state.isScrollingActive {
                IslandEmergingBanner(tint: .black, reduceMotion: reduceMotion) {
                    MessageDayStickyLabel(label: label)
                }
                .id(label)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Contenu texte de la pill sticky — blanc sur noir, la couleur native de
/// l'encoche plutôt que le glass indigo du séparateur inline
/// (`MessageDaySeparator`) : posée si près de l'îlot, elle doit se lire comme
/// un prolongement du système, pas comme une pastille produit.
/// `IslandEmergingBanner` fournit la capsule/le fond ; ce type ne pose que le
/// texte et son padding.
private struct MessageDayStickyLabel: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isHeader)
    }
}
