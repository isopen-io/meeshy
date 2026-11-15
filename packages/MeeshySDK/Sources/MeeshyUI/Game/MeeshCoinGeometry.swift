import SwiftUI
import MeeshySDK

// MARK: - La géométrie de la Meesh (épopée § 6, #11176)
//
// Le REJEU iOS de `packages/shared/design/meesh-coin.json`, la seule source des coordonnées de la pièce (repère
// 120 × 120, origine en haut à gauche, angles en degrés dans le sens horaire depuis 3 h). Le web le lit
// (`apps/web/src/lib/game/coin-geometry.ts`) ; iOS ne peut pas lire un fichier hors de son paquet, il en porte donc
// la valeur, et le témoin `MeeshCoinGeometryTests` DÉCODE le fichier partagé et exige qu'il soit égal, champ pour
// champ, à `MeeshCoinGeometry.shared`. Une coordonnée changée d'un seul côté rougit le témoin.
//
// Les couleurs n'y sont pas : chaque matière nomme une peinture (`GamePalette.coinPaint`).

struct MeeshCoinGeometry: Decodable, Equatable, Sendable {

    enum Paint: String, Decodable, Sendable {
        case coinSilver = "coin-silver"
        case coinGold = "coin-gold"
        case prism
        case coinSilverIn = "coin-silver-in"
        case coinGoldIn = "coin-gold-in"
        case coinDiamondIn = "coin-diamond-in"
    }

    /// La tranche cannelée : gris de tranche (argent), encre de l'or (or), spectre à contre-sens (prisme).
    enum Flute: String, Decodable, Sendable { case rim, ink, iris }

    enum Separator: String, Decodable, Sendable { case dot, star }

    enum Decor: String, Decodable, Sendable {
        case veins, beads, rosette, stars, laurels, iris, cabochons, sunburst, crown, sparkles
    }

    struct Body: Decodable, Equatable, Sendable {
        struct Flute: Decodable, Equatable, Sendable {
            let radius: CGFloat
            let width: CGFloat
            let dash: [CGFloat]
        }
        let radius: CGFloat
        let flute: Flute
    }

    struct Field: Decodable, Equatable, Sendable {
        let radius: CGFloat
        let stroke: CGFloat
    }

    struct Fields: Decodable, Equatable, Sendable {
        let obverse: Field
        let reverse: Field
    }

    struct Inscription: Decodable, Equatable, Sendable {
        let text: String
        let repetitions: Int
        let separator: String
        let radius: CGFloat
        let startDeg: CGFloat
        let fontSize: CGFloat

        private enum CodingKeys: String, CodingKey {
            case text, separator, radius, startDeg, fontSize
            case repetitions = "repeat"
        }
    }

    struct Signature: Decodable, Equatable, Sendable {
        let size: CGFloat
        let strokeWidth: CGFloat
    }

    struct Year: Decodable, Equatable, Sendable {
        let y: CGFloat
        let fontSize: CGFloat
        let letterSpacing: CGFloat
    }

    /// « Nº » : le N, le o en exposant SOULIGNÉ, puis le nombre plus petit, redescendu sur la ligne de base.
    struct Number: Decodable, Equatable, Sendable {
        let y: CGFloat
        let sign: String
        let ordinal: String
        let signSize: CGFloat
        let ordinalSize: CGFloat
        let ordinalRise: CGFloat
        let valueSize: CGFloat
        let valueGap: CGFloat
    }

    struct Bird: Decodable, Equatable, Sendable {
        let bird: GameEngravedBirds.Bird
        let x: CGFloat
        let y: CGFloat
        let scale: CGFloat
        let flip: Bool
    }

    struct Sides: Decodable, Equatable, Sendable {
        let obverse: [Decor]
        let reverse: [Decor]
    }

    struct Edition: Decodable, Equatable, Sendable {
        let metal: Paint
        let flute: Flute
        let field: Paint
        let separator: Separator
        let birds: [Bird]
        let decor: Sides
    }

    struct Editions: Decodable, Equatable, Sendable {
        let silver: Edition
        let gold: Edition
        let prism: Edition
    }

    let frame: CGFloat
    let center: CGFloat
    let body: Body
    let field: Fields
    let inscription: Inscription
    let signature: Signature
    let year: Year
    let number: Number
    let editions: Editions
    let decor: MeeshCoinDecorGeometry

    func edition(_ edition: MeeshEdition) -> Edition {
        switch edition {
        case .silver: editions.silver
        case .gold: editions.gold
        case .prism: editions.prism
        }
    }
}

extension MeeshCoinGeometry {

    /// La valeur de `packages/shared/design/meesh-coin.json`, recopiée — le témoin la compare au fichier.
    static let shared = MeeshCoinGeometry(
        frame: 120,
        center: 60,
        body: Body(radius: 57, flute: Body.Flute(radius: 53, width: 1.4, dash: [1.4, 2])),
        field: Fields(obverse: Field(radius: 35, stroke: 1.6), reverse: Field(radius: 45, stroke: 1.4)),
        inscription: Inscription(text: "MEESHY · 1 MEESH · ", repetitions: 2, separator: "·", radius: 45,
                                 startDeg: 180, fontSize: 8.4),
        signature: Signature(size: 66, strokeWidth: 100),
        year: Year(y: 27, fontSize: 8, letterSpacing: 2),
        number: Number(y: 97, sign: "N", ordinal: "o", signSize: 12, ordinalSize: 6.6, ordinalRise: 4.6,
                       valueSize: 8, valueGap: 1.4),
        editions: Editions(
            silver: Edition(
                metal: .coinSilver, flute: .rim, field: .coinSilverIn, separator: .dot,
                birds: [Bird(bird: .meeJoy, x: 35, y: 31, scale: 0.36, flip: false)],
                decor: Sides(obverse: [.veins], reverse: [.veins])
            ),
            gold: Edition(
                metal: .coinGold, flute: .ink, field: .coinGoldIn, separator: .star,
                birds: [Bird(bird: .meoOpen, x: 35, y: 31, scale: 0.36, flip: false)],
                decor: Sides(obverse: [.beads, .rosette, .stars], reverse: [.beads, .rosette, .laurels])
            ),
            prism: Edition(
                metal: .prism, flute: .iris, field: .coinDiamondIn, separator: .dot,
                birds: [
                    Bird(bird: .meeJoy, x: 13, y: 33, scale: 0.34, flip: false),
                    Bird(bird: .meoOpen, x: 107, y: 33, scale: 0.34, flip: true),
                ],
                decor: Sides(obverse: [.iris, .beads, .cabochons, .sunburst, .sparkles],
                             reverse: [.iris, .beads, .cabochons, .sunburst, .crown, .sparkles])
            )
        ),
        decor: .shared
    )
}
