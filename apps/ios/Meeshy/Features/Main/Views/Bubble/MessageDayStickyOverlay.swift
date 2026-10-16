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

/// **Quelle rangée la pastille flottante nomme — ou aucune** (#4602).
///
/// Règle : jamais deux pastilles de date visibles en même temps. La pastille
/// flottante nomme le jour de la rangée RÉELLEMENT en haut du fil — la plus
/// haute dont le bas dépasse la ligne de lecture (le haut de la pastille, sous
/// la bande de l'en-tête) — et se tait dès qu'une pastille de section est
/// visible entre cette ligne et le bas de l'écran du fil (sous la barre de
/// composition, transparente, comprise : une pastille qui y affleure se voit).
///
/// Deux défauts qu'elle ferme (recettes du 2026-10-16) : l'item de tête était
/// le plus grand `IndexPath` VISIBLE au sens de la collection, qui court
/// jusqu'au bord de l'écran — un message déjà sorti sous l'en-tête restait «
/// en haut » et la pastille retardait d'une section ; et la pastille ne se
/// taisait que si la section ÉTAIT l'item de tête, d'où « Hier » flottant
/// au-dessus de la pastille de section « Aujourd'hui ».
///
/// Coordonnées de l'écran du fil (la vue du contrôleur), haut vers le bas.
nonisolated enum MessageDayStickyLaw {
    struct Row: Equatable {
        let isDayHeader: Bool
        let minY: CGFloat
        let maxY: CGFloat
    }

    /// L'indice, dans `rows`, de la rangée dont la pastille nomme le jour ;
    /// `nil` : la pastille se tait.
    static func stickyRow(rows: [Row], readingLine: CGFloat, viewportBottom: CGFloat) -> Int? {
        let visible = rows.indices.filter { rows[$0].maxY > readingLine && rows[$0].minY < viewportBottom }
        guard !visible.contains(where: { rows[$0].isDayHeader }) else { return nil }
        return visible.min { rows[$0].minY < rows[$1].minY }
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
