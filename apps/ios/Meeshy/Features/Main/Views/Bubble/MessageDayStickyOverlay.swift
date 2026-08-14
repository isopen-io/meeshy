import SwiftUI
import UIKit
import Combine
import MeeshyUI

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
/// poser tout près de l'îlot. `IslandEmergingBanner` place lui-même la pill à
/// au moins `IslandGeometry.clearanceBelow` sous l'îlot : l'offset ici reste à
/// 0 pour ne pas cumuler deux marges.
enum MessageDayStickyPlacement {
    nonisolated static let topOffset: CGFloat = 0
}

/// Métriques de la pill posée. Police et paddings étant FIXES, sa taille se
/// calcule exactement — pas besoin d'une mesure asynchrone au rendu.
///
/// C'est cette taille que `IslandEmergingBanner` convertit en ratio d'échelle
/// de naissance : une estimation approximative ferait naître la capsule à côté
/// de l'îlot au lieu de dedans (défaut corrigé le 2026-08-13).
enum MessageDayStickyMetrics {
    static let horizontalPadding: CGFloat = 14
    static let verticalPadding: CGFloat = 7

    /// Police de la pill — miroir exact de `.font(.caption.weight(.semibold))`
    /// posée par `MessageDayStickyLabel`, en UIKit pour être mesurable.
    /// Dérivée de `.caption1` : la pill suit le Dynamic Type comme le reste.
    static var font: UIFont {
        let base = UIFont.preferredFont(forTextStyle: .caption1)
        let descriptor = base.fontDescriptor.addingAttributes([
            .traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.semibold]
        ])
        return UIFont(descriptor: descriptor, size: base.pointSize)
    }

    static func settledSize(for label: String, font: UIFont) -> CGSize {
        let text = (label as NSString).size(withAttributes: [.font: font])
        return CGSize(
            width: text.width.rounded(.up) + horizontalPadding * 2,
            height: text.height.rounded(.up) + verticalPadding * 2
        )
    }

    static func settledSize(for label: String) -> CGSize {
        settledSize(for: label, font: font)
    }
}

/// Couleurs de la pill sticky.
///
/// Règle produit (2026-08-13) : la pill garde les **couleurs de base** de son
/// homologue inline (`MessageDaySeparator`, famille indigo) une fois posée ;
/// le blanc sur noir est réservé au moment où l'information est **à
/// l'intérieur de la Dynamic Island**, où elle doit se lire comme un rendu
/// système. L'interpolation entre les deux suit l'avancement du morph.
enum MessageDayStickyPalette {
    static func capsuleColor(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo50
    }

    static func settledTextColor(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700
    }

    /// Blanc dans l'îlot (`progress == 0`) → couleur de base une fois posée.
    static func textColor(isDark: Bool, progress: CGFloat) -> Color {
        blend(.white, settledTextColor(isDark: isDark), progress: progress)
    }

    /// Interpolation linéaire sRGB. Repli sur la couleur d'arrivée si l'une
    /// des deux n'expose pas de composantes RGB (motif, matériau) — mieux vaut
    /// la teinte finale exacte qu'un gris arbitraire.
    static func blend(_ from: Color, _ to: Color, progress: CGFloat) -> Color {
        let t = min(max(progress, 0), 1)
        var fr: CGFloat = 0, fg: CGFloat = 0, fb: CGFloat = 0, fa: CGFloat = 0
        var tr: CGFloat = 0, tg: CGFloat = 0, tb: CGFloat = 0, ta: CGFloat = 0
        guard UIColor(from).getRed(&fr, green: &fg, blue: &fb, alpha: &fa),
              UIColor(to).getRed(&tr, green: &tg, blue: &tb, alpha: &ta) else {
            return to
        }
        return Color(
            .sRGB,
            red: Double(fr + (tr - fr) * t),
            green: Double(fg + (tg - fg) * t),
            blue: Double(fb + (tb - fb) * t),
            opacity: Double(fa + (ta - fa) * t)
        )
    }
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
    /// True quand le header de conversation est DÉPLIÉ (tap sur l'avatar ou
    /// l'icône de conversation). Le header déplié occupe alors une bande
    /// haute et détaillée : y superposer la pill encombrerait la vue, alors
    /// même que l'utilisateur vient de demander à voir ces détails. La pill
    /// se retire donc entièrement tant qu'il est ouvert — y compris pendant
    /// un défilement (retour user 2026-08-13).
    @Published var isHeaderExpanded: Bool = false
}

/// Overlay SwiftUI piné au top du collectionView : affiche le séparateur de
/// jour du message en haut visible pendant le défilement actif, avec
/// l'animation d'émergence/rétraction dans l'îlot (`IslandEmergingBanner`
/// — pattern déjà éprouvé par la bannière d'appel, jusqu'ici jamais monté).
/// Sur Dynamic Island : la pill sortante rentre EXACTEMENT dans l'îlot, en
/// prenant sa géométrie et son noir, avant que la nouvelle en ressorte pour se
/// poser sous lui avec ses couleurs de base. `.id(label)` force cette identité
/// de vue distincte à chaque changement de jour — sans lui, SwiftUI mettrait
/// juste le texte à jour en place, aucune transition ne rejouerait. Sans îlot
/// (notch classique/SE) ou sous Reduce Motion, `IslandEmergingBanner` bascule
/// seul sur son repli : pill posée statique, simple fondu.
struct MessageDayStickyOverlay: View {
    @ObservedObject var state: MessageDayStickyState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
                IslandEmergingBanner(
                    tint: MessageDayStickyPalette.capsuleColor(isDark: colorScheme == .dark),
                    settledSize: MessageDayStickyMetrics.settledSize(for: label),
                    reduceMotion: reduceMotion
                ) {
                    MessageDayStickyLabel(label: label, isDark: colorScheme == .dark)
                }
                .id(label)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Contenu texte de la pill sticky. Sa couleur suit l'avancement du morph
/// (`islandEmergenceProgress`) : blanc tant qu'il est DANS l'îlot — où il doit
/// se lire comme un rendu système sur le noir du matériel — puis couleur de
/// base indigo une fois posé, à l'identique du séparateur inline
/// (`MessageDaySeparator`). `IslandEmergingBanner` fournit la capsule et son
/// fond ; ce type ne pose que le texte et son padding.
private struct MessageDayStickyLabel: View {
    let label: String
    let isDark: Bool
    @Environment(\.islandEmergenceProgress) private var emergenceProgress

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .foregroundColor(
                MessageDayStickyPalette.textColor(isDark: isDark, progress: emergenceProgress)
            )
            .lineLimit(1)
            .padding(.horizontal, MessageDayStickyMetrics.horizontalPadding)
            .padding(.vertical, MessageDayStickyMetrics.verticalPadding)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isHeader)
    }
}
