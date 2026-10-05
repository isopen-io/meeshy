import SwiftUI
import Combine

/// Placement vertical de la pill sticky de jour dans le viewport de la liste.
///
/// Décalage sous le bord haut de la safe area. La pill vivait à +4, en plein
/// sous la Dynamic Island : une Live Activity (bandeau noir étendu sous
/// l'îlot) la recouvrait, et elle chevauchait la rangée du header flottant
/// (retour user 2026-08-12, capture à l'appui). 60 = padding haut du header
/// (8) + rangée de contrôles (~44) + marge (8) — la pill démarre SOUS le
/// header, hors de la barre noire status bar / îlot.
///
/// C'est la géométrie qui sépare les deux, PAS une exclusion mutuelle : le
/// header reste lisible pendant que la pill suit le défilement (retour user
/// 2026-08-14, retour à la gestion d'avant le 13/08 au soir). Seuls les
/// BOUTONS D'ACTION du header s'effacent pendant le mouvement — loi commune
/// `ScrollMotion`, cf. `ConversationView.hidesHeaderActions(...)`.
///
/// **La bande suit la hauteur MESURÉE de l'en-tête (#7998).** 60 n'est qu'un
/// PLANCHER : en Dynamic Type AX1–AX5, la rangée (« AUTO Focal », retour,
/// avatar) grandit avec le texte et recouvrait la pill posée à 60. Ce que
/// l'en-tête gagne au-delà du plancher décale d'autant la pill de jour, la
/// pilule jour·heure de Focal et la réserve de la rangée plate.
enum MessageDayStickyPlacement {
    nonisolated static let topOffset: CGFloat = 60
    /// Marge entre le bas de la bande d'en-tête et la pill.
    nonisolated static let headerGap: CGFloat = 8

    /// Ce que l'en-tête mesuré (padding haut compris) dépasse du plancher.
    /// 0 tant qu'il n'est pas mesuré ou qu'il tient dans la bande historique.
    nonisolated static func headerGrowth(headerBandHeight: CGFloat) -> CGFloat {
        max(0, (headerBandHeight + headerGap - topOffset).rounded(.up))
    }

    nonisolated static func topOffset(headerBandHeight: CGFloat) -> CGFloat {
        topOffset + headerGrowth(headerBandHeight: headerBandHeight)
    }

    nonisolated static func scrollTimePillTop(headerBandHeight: CGFloat) -> CGFloat {
        FocalMetrics.Pill.top + headerGrowth(headerBandHeight: headerBandHeight)
    }
}

/// État réactif qui pilote l'affichage de la pill flottante « Aujourd'hui /
/// Hier / Lundi 9 mai » au top de la liste des messages. Sert de pont entre
/// `MessageListViewController.scrollViewDidScroll` (UIKit, calcul du
/// `dayStart` du message en haut visible) et l'overlay SwiftUI hébergé via
/// `UIHostingController`. Quand `label == nil`, l'overlay ne rend rien et
/// laisse passer les évènements vers le collectionView en-dessous.
@MainActor
final class MessageDayStickyState: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var label: String? = nil
    @Published var isDark: Bool = false
    /// True quand le header de conversation est DÉPLIÉ (tap sur l'avatar ou
    /// l'icône de conversation). Déplié, le header descend jusque dans la
    /// bande de la pill — et l'utilisateur vient de demander à voir les
    /// détails de la conversation, pas la date du haut de l'écran.
    @Published var isHeaderExpanded: Bool = false
    /// Focal + défilement actif : la pilule fait partie du chrome escamoté
    /// pendant le mouvement (chaque rangée révèle déjà son heure, la date de
    /// tête est du bruit). Posée par `MessageListViewController.
    /// setScrollingActive` — jamais en mode bulles, qui garde le
    /// comportement historique.
    @Published var isSuppressed: Bool = false
}

/// Overlay SwiftUI piné au top du collectionView : affiche le séparateur
/// de jour du message en haut visible. Indépendant du flux scrollable —
/// c'est la pill « sticky » qui ne défile pas avec le contenu.
struct MessageDayStickyOverlay: View {
    @ObservedObject var state: MessageDayStickyState

    var body: some View {
        Group {
            if let label = state.label, !state.isHeaderExpanded, !state.isSuppressed {
                MessageDaySeparator(label: label, isDark: state.isDark)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: state.label)
        .animation(.easeInOut(duration: 0.18), value: state.isHeaderExpanded)
        .animation(.easeInOut(duration: 0.18), value: state.isSuppressed)
        .allowsHitTesting(false)
    }
}
