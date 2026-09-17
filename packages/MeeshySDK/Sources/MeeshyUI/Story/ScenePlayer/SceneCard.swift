import SwiftUI
import MeeshySDK

/// **Il n'y a qu'UNE carte de scène** (directive porteur du 2026-09-17, lot
/// #6904).
///
/// > « POURQUOI ne reproduisons-nous pas la même chose que la scène des stories
/// > sur les scènes de POST ? C'est EXACTEMENT le même lecteur et le même
/// > comportement qu'il faut appliquer. »
///
/// ## Ce que la directive corrige
///
/// Ce que le lecteur de stories montre — une carte 9:16 arrondie, le fond
/// dominant du ThumbHash DANS la carte, le média posé sans rognage, un seul
/// peintre — est déjà ce que le plein écran CADRÉ d'un post doit montrer. Les
/// deux le faisaient, et le faisaient DEUX FOIS : `readerCard(framing:…)`
/// (`background` + `clipShape` + `scaleEffect` + `offset` sur un
/// `StoryCanvasFraming.Result`) d'un côté, le `ZStack` de `GalleryScenePage`
/// (`SceneBackdropView` + player + `frame` + `clipShape` sur un
/// `GallerySceneStage.Frame`) de l'autre.
///
/// Deux assemblages ÉQUIVALENTS ne sont pas le même composant : ils rendaient
/// déjà deux fonds différents (couleur dominante chez l'un, hachage étiré chez
/// l'autre) et deux rayons différents (22 et 20) sur la MÊME carte, sans qu'un
/// seul témoin puisse rougir — chacun était juste chez lui.
///
/// > **Une convergence de COMPORTEMENT ne se prouve pas en comparant deux
/// > écritures ; elle se prouve en n'en gardant qu'une.**
///
/// ## Ce que la carte fait, et c'est tout
///
/// 1. elle DIMENSIONNE son contenu aux cotes que la loi donne à la scène
///    (`layout.sceneFrame.size`) — jamais un `.aspectRatio` réécrit à la main ;
/// 2. elle PEINT le hors-champ, dans la carte et sous le contenu, **seulement
///    si la loi dit qu'il reste quelque chose à peindre** (`layout.backdrop`,
///    `nil` en immersif) ;
/// 3. elle ROGNE à la zone visible, coins arrondis au rayon de la loi.
///
/// Ce qui reste à l'HÔTE : la PLACE et l'ANIMATION. Le lecteur de stories
/// applique son `scaleEffect`/`offset` (`StoryCanvasFraming.Result`) ; la
/// galerie pose la carte dans la région du plateau et lui donne ses gestes. Ni
/// l'un ni l'autre ne refait de fond, de clip ou de cadre — la garde de source
/// `SceneShapeSourceGuardTests` interdit qu'ils recommencent.
///
/// ## Les deux compensations, et pourquoi elles sont des PARAMÈTRES
///
/// - **`visible`** — la boîte que l'hôte montre. `nil` ⇒ la scène entière, ce
///   qui est le cas CADRÉ (elle tient). En immersif la scène DÉBORDE : l'hôte
///   dit la région, et le rognage de la carte est la définition même de
///   « couvrir le viewport » pour une forme figée.
/// - **`hostScale`** — l'échelle que l'hôte appliquera PAR-DESSUS la carte. Le
///   clip vit dans l'espace non mis à l'échelle : sans compensation, une carte
///   peinte à 0,5 rendrait un rayon de 10 là où la loi en veut 20. L'hôte
///   DÉCLARE son facteur plutôt que de faire la division lui-même — c'est ce
///   qui retire la dernière ligne d'arithmétique de forme des deux hôtes.
/// - **`cornerRadius`** — le rayon COURANT, quand l'hôte l'anime. Le lecteur de
///   stories ouvre sa carte jusqu'au plein bord et le rayon descend alors à 0 :
///   c'est un état de son ANIMATION, pas une autre loi de forme. `nil` ⇒ celui
///   de la loi, le cas de toute surface qui n'anime rien.
///
/// Elle vit dans `MeeshyUI/Story/ScenePlayer` — auprès du moteur qu'elle
/// habille — et prend des paramètres OPAQUES : une valeur de loi, une chaîne,
/// deux nombres, un contenu. Aucun singleton Meeshy, aucune décision de
/// « quand » : un atome d'interface au sens du tableau de placement du SDK.
public struct SceneCard<Content: View>: View {

    private let layout: SceneShape.Layout
    private let thumbHash: String?
    private let region: CGSize?
    private let cornerRadiusOverride: CGFloat?
    private let hostScale: CGFloat
    private let content: Content

    public init(layout: SceneShape.Layout,
                thumbHash: String?,
                visible: CGSize? = nil,
                cornerRadius: CGFloat? = nil,
                hostScale: CGFloat = 1,
                @ViewBuilder content: () -> Content) {
        self.layout = layout
        self.thumbHash = thumbHash
        self.region = visible
        self.cornerRadiusOverride = cornerRadius
        self.hostScale = hostScale
        self.content = content()
    }

    /// **La boîte VISIBLE d'une carte** — la scène quand elle tient, la région
    /// quand elle déborde. Une seule écriture pour les deux états, plutôt qu'un
    /// branchement qu'on oublierait d'un côté.
    public nonisolated static func visibleSize(layout: SceneShape.Layout,
                                               region: CGSize?) -> CGSize {
        guard let region else { return layout.sceneFrame.size }
        return CGSize(width: min(layout.sceneFrame.width, region.width),
                      height: min(layout.sceneFrame.height, region.height))
    }

    /// **Le rayon à ROGNER, dans l'espace non mis à l'échelle de la carte.**
    ///
    /// Un facteur nul ou négatif ne compense rien — la carte n'est alors pas
    /// peinte : on rend le rayon tel quel plutôt qu'une division par zéro.
    public nonisolated static func unscaledCornerRadius(layout: SceneShape.Layout,
                                                        override: CGFloat?,
                                                        hostScale: CGFloat) -> CGFloat {
        let rayon = override ?? layout.cornerRadius
        return hostScale > 0 ? rayon / hostScale : rayon
    }

    private var visible: CGSize { Self.visibleSize(layout: layout, region: region) }

    private var cornerRadius: CGFloat {
        Self.unscaledCornerRadius(layout: layout, override: cornerRadiusOverride,
                                  hostScale: hostScale)
    }

    public var body: some View {
        ZStack {
            // **Le fond n'existe que s'il reste quelque chose à peindre.** En
            // immersif la scène couvre le viewport : la loi rend `nil`, cette
            // couche n'est pas montée, et la troisième couche de #6806
            // disparaît par construction plutôt que par consigne.
            if let fond = layout.backdrop {
                SceneBackdropView(backdrop: fond, thumbHash: thumbHash)
            }
            content
                .frame(width: layout.sceneFrame.width, height: layout.sceneFrame.height)
        }
        .frame(width: visible.width, height: visible.height)
        // `clipShape` AVANT toute transformation de l'hôte : appliqué après, le
        // clip resterait sur les bornes NON déplacées — le contenu décalé vers
        // le bas garderait un bord haut carré et se ferait rogner en bas par
        // les coins du rectangle d'origine (bug user 2026-07-11, « haut carré,
        // bas à moitié arrondi »). C'est la raison pour laquelle l'hôte
        // DÉCLARE son échelle au lieu de l'appliquer avant la carte.
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
