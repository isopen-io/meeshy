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

    /// **La légende est-elle TRONQUÉE ?** — la question que le « plus… » pose.
    ///
    /// Elle se demande à la règle plutôt qu'en comparant deux chaînes : une
    /// comparaison `abrégé != complet` répondrait aussi « oui » pour une
    /// légende inchangée dont on aurait seulement rogné les espaces.
    static func isTruncated(_ caption: String) -> Bool {
        let propre = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !propre.isEmpty else { return false }
        return MediaCaptionRule.collapse(propre, words: wordCount).1
    }

    /// Le texte complet, débarrassé de ses bords.
    static func full(_ caption: String) -> String {
        caption.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// **Le « plus… » déplie, et il ne vole pas le tap de l'image**
    /// (directive porteur 2026-09-06 : « la légende tronquée sur les
    /// scènes/images doit avoir le "plus…" pour déplier et tout lire »).
    ///
    /// Avant ce lot, la couche entière était `allowsHitTesting(false)` et
    /// l'ellipse promettait une suite que rien n'ouvrait — un contrôle inerte
    /// au sens de la loi 4, donc pire qu'une absence : il annonce une
    /// capacité. Mais lever le verrou sur TOUTE la couche aurait volé à
    /// l'image le geste qui l'ouvre en plein écran.
    ///
    /// > La couche reste inerte ; seul le LIBELLÉ est touchable. Le dégradé,
    /// > le texte et l'espace autour laissent passer le doigt vers ce qu'ils
    /// > décrivent.
    @State private var deplie = false

    var body: some View {
        if let caption, let texte = Self.abridged(caption) {
            contenu(caption: caption, abrege: texte)
        }
    }

    @ViewBuilder
    private func contenu(caption: String, abrege: String) -> some View {
        let tronquee = Self.isTruncated(caption)
        VStack(alignment: .leading, spacing: 2) {
            Text(deplie ? Self.full(caption) : abrege)
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.top, 28)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Le texte lui-même ne prend aucun geste : le doigt posé
                // dessus doit ouvrir l'image, comme partout ailleurs sur la
                // carte.
                .allowsHitTesting(false)

            if tronquee {
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                        deplie.toggle()
                    }
                } label: {
                    Text(deplie ? Self.moinsLibelle : Self.plusLibelle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        // La cible dépasse le glyphe : « plus… » fait six
                        // caractères, et une cible de six caractères n'est pas
                        // une cible (44 pt, HIG).
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(deplie ? Self.moinsLibelle : Self.plusLibelle)
                // VoiceOver n'a JAMAIS eu de légende tronquée : le texte
                // entier lui est lu d'un bloc par le libellé de la carte. Ce
                // bouton n'a donc de sens que pour l'œil, et l'annoncer
                // proposerait un geste sans objet.
                .accessibilityHidden(true)
            }
        }
        .padding(.bottom, 12)
        // Le dégradé n'existe que SOUS la légende : sans elle, rien ne
        // s'assombrit. Un voile permanent ferait payer à toutes les cartes le
        // coût de celles qui parlent.
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.72)],
                           startPoint: .top, endPoint: .bottom)
        )
    }

    /// Les deux libellés du dépliage. Au catalogue, comme tout ce qui se lit.
    static var plusLibelle: String {
        String(localized: "feed.caption.expand", defaultValue: "plus…", bundle: .main)
    }

    static var moinsLibelle: String {
        String(localized: "feed.caption.collapse", defaultValue: "moins", bundle: .main)
    }
}
