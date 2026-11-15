import SwiftUI
import UIKit
import MeeshySDK

/// **Il n'y a qu'UN sol sous une scène**, comme il n'y a qu'une carte
/// (`SceneCard`) — directive porteur du 2026-09-17, lot #6904 :
///
/// > « On préserve le même fond que pour la story ! »
///
/// ## Ce que la carte ne pouvait pas fermer
///
/// `SceneCard` a fait converger ce qui se peint DANS la carte : même cadre, même
/// fond, même rayon sur les quatre surfaces. La recette au simulateur a trouvé
/// UN écart restant, et il était DEHORS — le lecteur de stories peignait autour
/// de sa carte une teinte sombre dérivée du ThumbHash, la galerie de post du
/// NOIR PUR, en cadré comme en immersif.
///
/// > **Une convergence mesurée DANS un composant ne dit rien de ce qui se peint
/// > à côté de lui.** La carte était déjà la même ; les deux pages ne se
/// > ressemblaient toujours pas, parce que ce qu'un œil compare d'abord est la
/// > page entière.
///
/// Le SOL est donc à la carte ce que le hors-champ est à la scène : la même
/// matière, une couche plus haut. `SceneBackdropView` habille le hors-champ
/// DANS la carte ; cette vue habille ce qui reste de l'écran AUTOUR d'elle.
///
/// ## La recette, à l'identique du lecteur de stories
///
/// 1. l'empreinte décodée (16×16 → rééchantillonnée), **remplie** puis floutée à
///    60, agrandie de 18 % et servie à 85 % — le flou ronge les bords d'une image
///    non agrandie, et `scaleEffect(1.18)` est ce qui repousse cette frange hors
///    du cadre ;
/// 2. un **voile** noir par-dessus, dont l'hôte donne la valeur : 0,18 quand la
///    carte est posée sur le plateau (le sol doit reculer derrière elle), 0 quand
///    la carte a pris l'écran (il n'y a presque plus de sol à voir).
///
/// **Aucun noir inconditionnel ici, et c'est une décision.** Le lecteur de
/// stories peint SOUS ce sol le fond de l'auteur — un dégradé ou un aplat — pour
/// une story sans média de fond ; un noir opaque posé ici l'effacerait. Sans
/// empreinte, cette vue ne peint donc que son voile, et ce qui vit dessous
/// (le dégradé de l'auteur chez le lecteur, le noir de la galerie et du réel)
/// reste visible. C'est ce qui permet à trois hôtes au sol différent de partager
/// la MÊME recette.
///
/// ## Ce qui reste à l'HÔTE, et pourquoi
///
/// L'identité (`.id`), la fusion (`.transition(.opacity)`), le débord
/// (`.ignoresSafeArea()`), la surdité au doigt (`.allowsHitTesting(false)`), le
/// silence pour VoiceOver et l'ANIMATION du voile : ce sont des décisions de
/// « quand », donc de l'orchestration. Un sol qui animerait lui-même son voile
/// imposerait son ressort aux trois hôtes, dont un seul en a un.
///
/// Paramètres OPAQUES — une chaîne, un nombre —, aucun singleton Meeshy, aucune
/// décision de « quand » : un atome d'interface au sens du tableau de placement
/// du SDK.
public struct SceneFloorView: View {

    private let thumbHash: String?
    private let veil: Double

    /// - Parameters:
    ///   - thumbHash: l'empreinte avec laquelle le sol se peint. Une chaîne vide
    ///     ou indécodable ne compte pas pour une empreinte — le sol ne peint
    ///     alors que son voile, laissant paraître ce que l'hôte a posé dessous.
    ///     Côté story, post et réel, son site unique est
    ///     `StoryItem.sceneBackdropHash`.
    ///   - veil: l'assombrissement posé sur le sol. 0,18 cardé, 0 immersif.
    public init(thumbHash: String?, veil: Double) {
        self.thumbHash = thumbHash
        self.veil = veil
    }

    /// Le rayon du flou, l'agrandissement et l'opacité du sol — la recette que
    /// le lecteur de stories portait seul jusqu'au 2026-09-17. Publics parce
    /// qu'un témoin doit pouvoir dire de quoi il mesure l'effet, jamais pour
    /// qu'un hôte les recompose.
    public static let blurRadius: CGFloat = 60
    public static let scale: CGFloat = 1.18
    public static let opacity: Double = 0.85
    /// Le voile d'un sol CARDÉ : la carte doit se détacher de ce qui l'entoure.
    public static let cardedVeil: Double = 0.18
    /// Le voile d'un sol IMMERSIF : la carte a pris l'écran, il n'y a presque
    /// plus de sol — l'assombrir ne séparerait rien.
    public static let fullVeil: Double = 0

    public var body: some View {
        ZStack {
            // **Le sol ne DICTE pas la taille de son hôte** (#7037).
            //
            // `scaledToFill()` rend une vue qui REMPLIT la proposition : au
            // moins une dimension déborde, et c'est cette taille débordante que
            // la vue annonce. Posée nue dans un `ZStack`, l'empreinte d'une
            // scène large mesurait 874 × 1,24 = 1082,7 pt et le plateau entier
            // prenait cette largeur, puis se centrait — bord gauche à
            // (402 − 1082,7) / 2 = −340,3. La croix « Fermer », alignée sur ce
            // bord, tombait à −326,3 : hors de l'écran (mesuré au simulateur).
            //
            // L'image passe donc en `overlay` d'une couche neutre : un overlay
            // ne participe JAMAIS au calcul de taille de son hôte. `Color.clear`
            // prend la place proposée, l'image la remplit et `clipped()` retire
            // ce qui dépasse. Rien ne change à l'écran ; seul le cadre annoncé
            // redevient celui de l'écran.
            Color.clear
                .overlay {
                    if let image = decoded {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .blur(radius: Self.blurRadius)
                            .scaleEffect(Self.scale)
                            .opacity(Self.opacity)
                    }
                }
                .clipped()
            Color.black.opacity(veil)
        }
        .accessibilityHidden(true)
    }

    private var decoded: UIImage? {
        guard let thumbHash, !thumbHash.isEmpty else { return nil }
        return UIImage.fromThumbHash(thumbHash)
    }
}
