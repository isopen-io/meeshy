import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Combien de slides la publication porte, et laquelle on compose**
/// (constat porteur 2026-09-06).
///
/// ## Le défaut mesuré
///
/// Au simulateur, sur staging : le rail droit de l'atelier offre `[+]`, qui
/// appelle bien `viewModel.addSlide()`. **Rien à l'écran ne le dit.** Ni
/// compteur, ni vignette, ni pastille — l'auteur crée des slides à l'aveugle,
/// ne sait pas combien il en a, et n'a AUCUN chemin de retour vers la
/// précédente. J'ai moi-même dû publier pour découvrir ce que le composer
/// portait.
///
/// > **Une action dont on ne voit pas l'effet n'est pas une action, c'est un
/// > pari.** Le bouton n'est pas inerte — il fait exactement ce qu'il promet —
/// > mais son résultat n'a aucun témoin visible, ce qui revient au même pour
/// > qui compose.
///
/// L'asymétrie était complète : `StoryComposerView.slideStrip` existe depuis
/// longtemps et rend ce service au composer de STORY. L'atelier du POST, né
/// plus tard, a hérité du `[+]` sans hériter de ce qui le rend lisible.
///
/// ## Où elle vit, et pourquoi
///
/// Dans le COULOIR bas, sous la carte, à côté du pied des références — jamais
/// sur la scène : une pastille de slide ne se peint sur aucun pixel du rendu,
/// et la poser sur le canvas ferait mentir l'aperçu tout en volant les touches
/// de la bande couverte (loi 6). C'est une zone de CONSTAT au sens du § 2
/// quater : elle dit ce que la publication porte, et le doigt y navigue.
///
/// ## Ce qu'elle n'est pas
///
/// Pas une pellicule de vignettes. Une vignette de slide demanderait un rendu
/// par slide — donc autant de canvas montés que de slides, dans un écran qui
/// en tient déjà un vivant. Les pastilles disent le COMPTE et le RANG, ce qui
/// est exactement ce qui manquait ; les vignettes sont une dette assumée, à
/// ouvrir si le porteur les demande.
struct ComposerSlideStrip: View {

    let slideCount: Int
    let currentIndex: Int
    let accentColor: Color
    let leadingInset: CGFloat
    let onSelect: (Int) -> Void

    var body: some View {
        if Self.isServed(slideCount: slideCount) {
            HStack(spacing: 6) {
                ForEach(0..<slideCount, id: \.self) { index in
                    Button { onSelect(index) } label: {
                        Capsule()
                            .fill(index == currentIndex
                                  ? accentColor
                                  : accentColor.opacity(0.28))
                            .frame(width: index == currentIndex ? 18 : 6, height: 6)
                            // La CIBLE reste à 44 pt alors que le dessin fait
                            // 6 : une pastille se vise avec un pouce, pas avec
                            // un curseur.
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(Self.libelle(index: index, total: slideCount)))
                    .accessibilityAddTraits(index == currentIndex ? [.isButton, .isSelected] : .isButton)
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: currentIndex)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, leadingInset)
            // La hauteur utile est celle des pastilles ; les cibles de 44 pt se
            // chevauchent volontiers avec le voisinage, mais la bande ne doit
            // pas pousser la scène de 44 pt vers le haut.
            .frame(height: 14)
        }
    }

    /// **Une pellicule d'un élément n'est pas une pellicule.** Même règle que
    /// la mosaïque : à une seule slide il n'y a ni compte à donner ni rang à
    /// désigner, et la bande n'occuperait de la place que pour se montrer.
    nonisolated static func isServed(slideCount: Int) -> Bool { slideCount > 1 }

    nonisolated static func libelle(index: Int, total: Int) -> String {
        String(format: String(localized: "composer.slide.strip.position",
                              defaultValue: "Slide %1$d sur %2$d", bundle: .main),
               index + 1, total)
    }
}
