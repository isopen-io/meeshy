import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La légende, PAR-DESSUS l'image, dans le listing du fil** (directive
/// porteur 2026-09-05).
///
/// > « lors du listing du feed ajouter les caption par dessus l'image les 20
/// > premiers mots et … »
///
/// ## Une couche pour les TROIS surfaces du fil
///
/// Le fil montre un média de trois façons, et chacune tronquait autrement :
/// le carrousel coupait à trois LIGNES (`lineLimit(3)`), la tuile d'un média
/// unique venait d'hériter du même chrome, et la carte de SCÈNE n'affichait
/// rien du tout. Trois surfaces, trois vérités sur « qu'est-ce qu'une légende
/// abrégée ».
///
/// > **Une troncature en LIGNES dépend de la largeur, de la police et de la
/// > taille Dynamic Type ; une troncature en MOTS n'en dépend d'aucune.** La
/// > première rend une longueur différente sur chaque appareil et à chaque
/// > réglage d'accessibilité — sur un grand corps de texte, trois lignes
/// > peuvent ne plus porter que six mots.
///
/// La règle est celle du composant plein écran (`MediaCaptionRule.collapse`),
/// appelée avec le seuil du fil : le dépôt a déjà UNE loi pour « abréger une
/// légende », et ce lot n'en écrit pas une seconde.
///
/// ## Ce qu'elle ne fait PAS
///
/// Aucun geste : le fil n'est pas l'endroit où l'on déplie. Le doigt sur
/// l'image ouvre le PLEIN ÉCRAN, qui porte la légende entière et son « voir
/// plus » — d'où `allowsHitTesting(false)`, sans quoi cette couche volerait le
/// tap à l'image qu'elle décrit.
struct FeedCaptionOverlay: View {

    /// **Vingt mots** (directive porteur). Distinct du seuil du plein écran
    /// (30 mots, tête de 15) : là-bas la légende est le sujet, ici elle
    /// accompagne une image qu'on parcourt.
    static let wordCount = 20

    let caption: String?

    /// Le texte servi : les vingt premiers mots, suivis d'un « … » SEULEMENT
    /// s'il reste quelque chose. Une ellipse posée sur une légende complète
    /// promettrait une suite qui n'existe pas.
    static func abridged(_ caption: String) -> String? {
        let propre = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !propre.isEmpty else { return nil }
        let (tete, tronquee) = MediaCaptionRule.collapse(propre, words: wordCount)
        return tronquee ? "\(tete)…" : tete
    }

    var body: some View {
        if let caption, let texte = Self.abridged(caption) {
            Text(texte)
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.bottom, 12)
                .padding(.top, 28)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Le dégradé n'existe que SOUS elle : sans légende, rien ne
                // s'assombrit. Un voile permanent ferait payer à toutes les
                // cartes le coût de celles qui parlent.
                .background(
                    LinearGradient(colors: [.clear, .black.opacity(0.72)],
                                   startPoint: .top, endPoint: .bottom)
                )
                .allowsHitTesting(false)
        }
    }
}
