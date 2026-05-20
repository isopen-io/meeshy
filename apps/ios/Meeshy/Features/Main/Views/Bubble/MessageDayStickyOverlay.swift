import SwiftUI
import Combine

/// État réactif qui pilote l'affichage de la pill flottante « Aujourd'hui /
/// Hier / Lundi 9 mai » au top de la liste des messages. Sert de pont entre
/// `MessageListViewController.scrollViewDidScroll` (UIKit, calcul du
/// `dayStart` du message en haut visible) et l'overlay SwiftUI hébergé via
/// `UIHostingController`. Quand `label == nil`, l'overlay ne rend rien et
/// laisse passer les évènements vers le collectionView en-dessous.
@MainActor
final class MessageDayStickyState: ObservableObject {
    @Published var label: String? = nil
    @Published var isDark: Bool = false
}

/// Overlay SwiftUI piné au top du collectionView : affiche le séparateur
/// de jour du message en haut visible. Indépendant du flux scrollable —
/// c'est la pill « sticky » qui ne défile pas avec le contenu.
struct MessageDayStickyOverlay: View {
    @ObservedObject var state: MessageDayStickyState

    var body: some View {
        Group {
            if let label = state.label {
                MessageDaySeparator(label: label, isDark: state.isDark)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: state.label)
        .allowsHitTesting(false)
    }
}
