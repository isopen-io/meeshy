import SwiftUI
import MeeshySDK

// MARK: - La Meesh, avers et revers (#9380, épopée § 6, #11176)
//
// LA MÊME pièce que le web (`apps/web/src/components/game/meesh-coin.tsx`), rejouée depuis la géométrie partagée
// `packages/shared/design/meesh-coin.json` (`MeeshCoinGeometry`) :
//   · AVERS, pour toutes les éditions : la Signature frappée, la couronne UNIVERSELLE « MEESHY · 1 MEESH » (jamais
//     traduite), la tranche cannelée ;
//   · REVERS : Mee (argent), Meo (or), Mee et Meo face à face (prisme), GRAVÉS dans le métal et COLORÉS
//     (`GameEngravedBirds`, #9540), l'année et « Nº » — le o monté et souligné, le nombre en petit.
// Trois éditions, que la loi partagée décide (`meeshEdition`) : argent veiné d'or, SOBRE ; or PUR, centre compris,
// RAFFINÉ ; or mêlé de diamant à la tranche irisée, ROYAL. Les éditions ne valent rien de plus en jeu : elles se
// collectionnent.
//
// La brique DESSINE la pièce, et fait scintiller les éclats du prisme (immobiles quand le mouvement est réduit ou que la
// pièce a quitté l'écran). Qu'elle se retourne, qu'une onde la frappe ou qu'un reflet la parcoure est la chorégraphie de
// l'app : les modificateurs `gameSpecularSheen`, `gameStrikeWave` et `gamePrismIridescence` s'y posent.

public struct MeeshCoinView: View {

    public enum Face: Sendable, Equatable {
        /// Le FLAN : la pièce avant la frappe, son métal, sa tranche et ses décors, sans couronne ni Signature — ce que la
        /// cérémonie de la frappe forme et pose sur l'enclume (#11177).
        case blank
        case obverse
        /// Le revers porte le numéro gravé et l'année de frappe.
        case reverse(number: Int, year: Int)
    }

    private let face: Face
    private let edition: MeeshEdition
    private let accessibilityLabel: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Faux quand la pièce a quitté la zone visible (défilement) — voir `GameOnScreen`.
    @State private var onScreen = true

    /// - Parameters:
    ///   - face: l'avers (Signature frappée) ou le revers (numéro et année).
    ///   - edition: argent, or (chaque centième) ou prisme (chaque millième).
    ///   - figures: IGNORÉ depuis #9540 — les oiseaux du revers sont ceux de l'édition, gravés dans le métal ; la pièce
    ///     ne porte plus de sticker. Le paramètre reste pour ne casser aucun appelant.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Meesh n° 13 ».
    public init(face: Face = .obverse, edition: MeeshEdition = .silver, figures: GameFigures? = .standard,
                accessibilityLabel: String? = nil) {
        self.face = face
        self.edition = edition
        self.accessibilityLabel = accessibilityLabel
    }

    var painter: MeeshCoinPainter {
        let geometry = MeeshCoinGeometry.shared
        let side: MeeshCoinPainter.Side = face == .obverse || face == .blank ? .obverse : .reverse
        return MeeshCoinPainter(geometry: geometry, edition: geometry.edition(edition), side: side)
    }

    private var twinkles: Bool { painter.has(.sparkles) && !reduceMotion && onScreen }

    public var body: some View {
        let painter = painter
        let twinkles = twinkles
        ZStack {
            Canvas { context, size in
                context.scaleBy(x: size.width / painter.geometry.frame, y: size.width / painter.geometry.frame)
                painter.drawBlank(in: &context)
                switch face {
                case .blank: break
                case .obverse: painter.drawObverse(in: &context)
                case .reverse(let number, let year): painter.drawReverse(number: number, year: year, in: &context)
                }
                if painter.has(.sparkles) && !twinkles { painter.drawSparkles(in: &context, time: nil) }
            }
            if twinkles {
                TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
                    Canvas { context, size in
                        context.scaleBy(x: size.width / painter.geometry.frame, y: size.width / painter.geometry.frame)
                        painter.drawSparkles(in: &context, time: timeline.date.timeIntervalSinceReferenceDate)
                    }
                }
                .allowsHitTesting(false)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .gameOnScreen { onScreen = $0 }
        .gameAccessibility(label: accessibilityLabel)
    }
}
