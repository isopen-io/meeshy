import SwiftUI
import UIKit
import MeeshySDK

/// **Le peintre du hors-champ d'une scène — un seul, sur les DEUX viewports**
/// (#6904, décision porteur du 2026-09-17).
///
/// `SceneShape.Backdrop` nomme les trois fonds qu'un plateau peut poser sous une
/// scène ajustée ; cette vue les peint, et c'est tout ce qu'elle fait.
/// `SceneShape.Layout.backdrop` n'est PAS optionnel : `layout(in:)` élit
/// toujours `cardedBackdrop`, cardé ou immersif — il n'y a plus qu'une carte,
/// et cette vue la monte inconditionnellement dans les deux (`SceneCard`).
///
/// ## Les trois fonds
///
/// - `.black` — la réponse JUSTE quand il n'y a aucune matière à étirer (média
///   sans hachage, première image non décodée). Ce n'est pas un repli honteux.
/// - `.thumbHash` — le hachage étiré, comme la galerie le fait sous une pièce
///   jointe depuis #6143. Trente-deux pixels de côté : c'est le
///   rééchantillonnage qui les lisse, donc aucun filtre, aucun rendu hors écran.
/// - `.thumbHashDominantColor` — **la préférence du porteur**, et la réponse au
///   défaut #6797 : deux surfaces qui étirent le MÊME hachage dans deux cadres
///   différents rendent deux dégradés voisins mais distincts, ce qui se lit
///   comme un défaut de rendu. Une couleur PLATE ne peut pas diverger d'un
///   cadre à l'autre — elle se calcule une fois, par la moyenne du hachage
///   décodé (`UIImage.thumbHashAverageColor`, site unique du SDK).
///
/// Elle vit dans `MeeshyUI` parce qu'elle PEINT : paramètres opaques (une
/// valeur de loi, une chaîne), aucun singleton Meeshy, aucune décision de
/// « quand » — donc un atome d'interface au sens du tableau de placement.
public struct SceneBackdropView: View {

    private let backdrop: SceneShape.Backdrop
    private let thumbHash: String?

    public init(backdrop: SceneShape.Backdrop, thumbHash: String?) {
        self.backdrop = backdrop
        self.thumbHash = thumbHash
    }

    public var body: some View {
        ZStack {
            // Le noir est le SOL des trois cas : une matière absente (hachage
            // vide, indécodable) laisse un fond, jamais un trou par lequel on
            // verrait la surface précédente.
            Color.black

            switch backdrop {
            case .black:
                EmptyView()
            case .thumbHashDominantColor:
                if let couleur = dominantColor {
                    Color(uiColor: couleur)
                }
            case .thumbHash:
                if let image = decoded {
                    // `.scaledToFill` : le fond doit être PLEIN. Un `.fit` y
                    // laisserait ses propres bandes — un letterbox dans un
                    // letterbox. L'hôte clippe.
                    Image(uiImage: image)
                        .resizable()
                        .interpolation(.low)
                        .scaledToFill()
                        .opacity(Double(StoryLetterboxFill.fillOpacity))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private var decoded: UIImage? {
        guard let thumbHash, !thumbHash.isEmpty else { return nil }
        return UIImage.fromThumbHash(thumbHash)
    }

    private var dominantColor: UIColor? {
        guard let thumbHash, !thumbHash.isEmpty else { return nil }
        return UIImage.thumbHashAverageColor(thumbHash)
    }
}
