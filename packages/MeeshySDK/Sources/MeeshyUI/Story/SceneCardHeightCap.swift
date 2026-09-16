import SwiftUI

/// **Plafonne la hauteur d'une carte de scène sans jamais la rogner ni la
/// zoomer** (#6767, décision « plafond 1,4 ajusté »).
///
/// > « Plafonner à 1,4 comme les cartes d'image, soit environ 338 × 473. La
/// > scène ENTIÈRE s'ajuste dans le plafond avec des bandes latérales, et
/// > reste jamais rognée. »
///
/// Le contenu garde son rapport NATUREL — `naturalAspect`, calculé par
/// l'appelant (`SceneFraming.cardAspect`, `SceneCarouselLayout.cardAspect`) —
/// centré dans une boîte qui ne dépasse jamais
/// `SceneFraming.maxCardHeightRatio` fois sa largeur. Ce qui dépasse laisse
/// des bandes vides de part et d'autre plutôt qu'un rognage : la même
/// contrainte que `SceneFocusFrame` refuse pour la même raison — un texte
/// coupé n'est jamais la bonne réponse à une carte trop haute.
///
/// C'est la même logique que `SceneCarouselLayout.pageAspect` applique déjà à
/// une page plus courte que la boîte de son carrousel (centrée, ajustée à son
/// propre rapport) — cette vue la rend disponible à la boîte ELLE-MÊME, pour
/// la carte mono-scène (`PostSceneCard`) et pour le carrousel du fil
/// (`PostSceneMosaic`).
public struct SceneCardHeightCap<Contenu: View>: View {

    /// Le rapport largeur/hauteur NATUREL du contenu — non plafonné.
    public let naturalAspect: CGFloat
    @ViewBuilder public let contenu: () -> Contenu

    public init(naturalAspect: CGFloat, @ViewBuilder contenu: @escaping () -> Contenu) {
        self.naturalAspect = naturalAspect
        self.contenu = contenu
    }

    public var body: some View {
        GeometryReader { geo in
            let taille = SceneFraming.cappedCardContentSize(naturalAspect: naturalAspect, in: geo.size)
            contenu()
                .frame(width: taille.width, height: taille.height)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .center)
        }
        .aspectRatio(SceneFraming.clampedCardAspect(naturalAspect), contentMode: .fit)
    }
}
