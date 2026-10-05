import Foundation
import CoreGraphics

/// LES CHORÉGRAPHIES DU JEU (#9381) — conception, partie V : « une animation
/// explique ce qui arrive. Elle tient 120 images par seconde sur iPhone
/// ProMotion et 60 ailleurs, ne bloque jamais un geste et se réduit à un fondu
/// quand l'utilisateur limite les animations ».
///
/// Chaque chorégraphie est une FONCTION du temps, pure : « à 0,45 s, le marteau
/// est en bas ». Elle se prouve sans écran, et la vue n'a plus qu'à la lire à
/// chaque image. Les durées sont celles de la planche.
nonisolated enum GameTimeline {

    static let strikeDuration: TimeInterval = 1.2
    static let rankDuration: TimeInterval = 1.6
    static let levelGainDuration: TimeInterval = 0.6
    static let levelLossDuration: TimeInterval = 0.8
    static let badgeDuration: TimeInterval = 0.7
    static let chestDuration: TimeInterval = 1.4
    /// Sous « réduire les animations » : un fondu, pas un mouvement.
    static let reducedDuration: TimeInterval = 0.25

    /// La fraction de `from` à `to` parcourue à l'instant `t`, bornée à [0, 1].
    static func window(_ t: Double, from: Double, to: Double) -> Double {
        guard to > from else { return t >= to ? 1 : 0 }
        return min(1, max(0, (t - from) / (to - from)))
    }

    /// Départ et arrivée en douceur — le geste ne démarre ni ne s'arrête net.
    static func smooth(_ x: Double) -> Double {
        let c = min(1, max(0, x))
        return c * c * (3 - 2 * c)
    }

    // MARK: - Frappe : Mee pose, Meo frappe, tchak, la pièce se retourne (1,2 s)

    /// L'instant du « tchak » : le marteau touche le flan.
    static let strikeImpact: Double = 0.45

    nonisolated struct Strike: Equatable {
        /// 0 : Mee loin du flan ; 1 : il l'a posé.
        let plate: Double
        /// 0 : marteau levé ; 1 : marteau sur le flan (à l'impact).
        let hammer: Double
        /// 0 → 1 : l'onde qui part du point d'impact.
        let wave: Double
        /// 0 : avers ; 1 : revers (le numéro).
        let flip: Double
        /// Le reflet qui parcourt la face, une fois.
        let sheen: Double
        /// Le « tchak ! » lisible un instant autour de l'impact.
        let burst: Double
    }

    static func strike(at seconds: Double) -> Strike {
        Strike(
            plate: smooth(window(seconds, from: 0, to: 0.3)),
            hammer: smooth(window(seconds, from: 0.3, to: strikeImpact)) * (1 - smooth(window(seconds, from: strikeImpact, to: 0.62))),
            wave: window(seconds, from: strikeImpact, to: 0.95),
            flip: smooth(window(seconds, from: 0.55, to: 1.2)),
            sheen: window(seconds, from: 0.7, to: 1.2),
            burst: sin(Double.pi * window(seconds, from: strikeImpact, to: 0.8))
        )
    }

    // MARK: - Rang : l'écu monte, la Signature se grave, les tenants se posent (1,6 s)

    /// Les trois traits de la Signature, un par tape haptique (`GameHapticPattern.rank`).
    static let rankStrokeTimes: [Double] = [0.55, 0.8, 1.05]

    nonisolated struct Rank: Equatable {
        /// 0 : l'écu est bas et transparent ; 1 : posé.
        let rise: Double
        /// L'éclat de chacun des trois traits, 0 → 1 → 0.
        let strokes: [Double]
        /// Les tenants se posent à la fin.
        let tenants: Double
        let sheen: Double
    }

    static func rank(at seconds: Double) -> Rank {
        Rank(
            rise: smooth(window(seconds, from: 0, to: 0.5)),
            strokes: rankStrokeTimes.map { sin(Double.pi * window(seconds, from: $0, to: $0 + 0.3)) },
            tenants: smooth(window(seconds, from: 1.15, to: 1.6)),
            sheen: window(seconds, from: 0.9, to: 1.6)
        )
    }

    // MARK: - Niveau : l'anneau se remplit ou se vide

    /// La fraction de l'arc entre deux niveaux : elle se remplit en 0,6 s, se vide en 0,8 s.
    static func ringProgress(from: Double, to: Double, at seconds: Double, duration: TimeInterval) -> Double {
        from + (to - from) * smooth(window(seconds, from: 0, to: duration))
    }

    // MARK: - Badge : la matière remonte du bas (0,7 s)

    static func badgeFill(lighting: Bool, at seconds: Double) -> Double {
        let rise = smooth(window(seconds, from: 0, to: badgeDuration))
        return lighting ? rise : 1 - rise
    }

    // MARK: - Coffre : le couvercle s'ouvre, les récompenses montent une à une (1,4 s)

    static let chestLidEnd: Double = 0.4

    /// 0 : fermé ; 1 : ouvert.
    static func chestLid(at seconds: Double) -> Double {
        smooth(window(seconds, from: 0, to: chestLidEnd))
    }

    /// L'instant où la récompense `index` (0, 1, 2) commence à monter.
    static func rewardStart(_ index: Int) -> Double {
        0.5 + Double(index) * 0.3
    }

    /// 0 : la récompense `index` est encore dans le coffre ; 1 : elle est sortie.
    static func reward(_ index: Int, at seconds: Double) -> Double {
        smooth(window(seconds, from: rewardStart(index), to: rewardStart(index) + 0.3))
    }
}
