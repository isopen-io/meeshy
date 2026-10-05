import SwiftUI

// MARK: - Mee et Meo, tenants des objets du jeu (#9380)
//
// Le dessin des deux colibris vient du pack de stickers intégré
// (`MeeStickerCatalog`) : la brique n'en recopie pas un trait. Elle reçoit les
// IDENTIFIANTS de film que l'hôte choisit — opaques pour elle — et pose leur
// première image, fixe : un objet du jeu est un tenant, pas une scène, et le
// mouvement des guides est la chorégraphie de l'app.

/// Les deux figures qui tiennent un écu, une coupe ou le revers d'une Meesh.
public struct GameFigures: Sendable, Equatable {
    /// Un identifiant du catalogue `MeeStickerCatalog` (`mee-sourire`).
    public let meeFilmID: String
    /// Un identifiant du catalogue `MeeStickerCatalog` (`meo-salut`).
    public let meoFilmID: String

    public init(meeFilmID: String, meoFilmID: String) {
        self.meeFilmID = meeFilmID
        self.meoFilmID = meoFilmID
    }

    /// Mee qui sourit, Meo qui salue : la paire de la planche.
    public static let standard = GameFigures(meeFilmID: "mee-sourire", meoFilmID: "meo-salut")
}

/// Une figure, fixe, dans un carré de `side`. `mirrored` retourne Meo pour qu'il
/// regarde vers l'intérieur de l'objet, comme sur la planche.
struct GameFigureView: View {
    let filmID: String
    let side: CGFloat
    var mirrored = false

    var body: some View {
        MeeStickerFilmView(filmID: filmID, animated: false, side: side, animates: false, pixelCap: 240)
            .scaleEffect(x: mirrored ? -1 : 1, y: 1)
            .frame(width: side, height: side)
            .allowsHitTesting(false)
    }
}

/// Les deux figures d'un objet de `viewBox` donné, posées dans les boîtes de la
/// planche (coordonnées du dessin SVG, ramenées à la place offerte).
struct GameTenantsLayer: View {
    struct Slot {
        /// Le centre de la boîte de la figure, en unités du dessin.
        let center: CGPoint
        /// Le côté de la boîte, en unités du dessin.
        let side: CGFloat
    }

    let figures: GameFigures
    let viewBox: CGSize
    let mee: Slot
    let meo: Slot

    var body: some View {
        GeometryReader { proxy in
            let k = proxy.size.width / viewBox.width
            ZStack {
                GameFigureView(filmID: figures.meeFilmID, side: mee.side * k)
                    .position(x: mee.center.x * k, y: mee.center.y * k)
                GameFigureView(filmID: figures.meoFilmID, side: meo.side * k, mirrored: true)
                    .position(x: meo.center.x * k, y: meo.center.y * k)
            }
        }
        .allowsHitTesting(false)
    }
}
