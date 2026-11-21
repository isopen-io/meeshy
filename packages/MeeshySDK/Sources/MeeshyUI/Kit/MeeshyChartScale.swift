import Foundation

/// **La loi pure du graphique (K50)** : les mêmes cinq fonctions et les mêmes
/// vecteurs sur les trois plateformes. Une valeur négative ou non finie vaut zéro ;
/// aucune division par zéro, jamais.
public nonisolated enum MeeshyChartScale {

    /// Chaque valeur rapportée à la plus grande (de 0 à 1) ; tout nul ⇒ zéro partout.
    public static func normalized(_ values: [Double]) -> [Double] {
        let served = values.map(serve)
        guard let top = served.max(), top > 0 else { return served.map { _ in 0 } }
        return served.map { $0 / top }
    }

    /// Les parts d'un ensemble : elles somment 1, ou zéro partout quand tout est nul.
    public static func segments(_ values: [Double]) -> [Double] {
        let served = values.map(serve)
        let total = served.reduce(0, +)
        guard total > 0 else { return served.map { _ in 0 } }
        return served.map { $0 / total }
    }

    /// Le premier maximum strictement positif ; rien s'il n'y en a pas.
    public static func peak(_ values: [Double]) -> Int? {
        let served = values.map(serve)
        guard let top = served.max(), top > 0 else { return nil }
        return served.firstIndex(of: top)
    }

    /// Les graduations : du zéro à un pas « joli » (1, 2 ou 5 fois une puissance de
    /// dix) qui dépasse ou égale le maximum. `count` est le nombre visé de graduations.
    public static func niceTicks(max maximum: Double, count: Int) -> [Double] {
        guard maximum.isFinite, maximum > 0, count >= 2 else { return [0] }
        let step = niceStep(maximum / Double(count - 1))
        let intervals = Int((maximum / step - 1e-9).rounded(.up))
        return (0...Swift.max(intervals, 1)).map { Double($0) * step }
    }

    /// Les arcs d'un anneau, en degrés : ils partent du haut (−90) et tournent dans
    /// le sens des aiguilles d'une montre. Chaque part dessine son angle.
    public static func arcs(_ fractions: [Double]) -> [(start: Double, end: Double)] {
        fractions.reduce(into: [(start: Double, end: Double)]()) { result, fraction in
            let start = result.last?.end ?? -90
            result.append((start: start, end: start + serve(fraction) * 360))
        }
    }

    /// Les valeurs dites : ce que l'hôte dit de chaque point, sinon son étiquette.
    public static func accessibilityValues(_ points: [MeeshyChartPoint]) -> [String] {
        points.map { $0.spoken.isEmpty ? $0.label : $0.spoken }
    }

    private static func serve(_ value: Double) -> Double {
        value.isFinite ? Swift.max(value, 0) : 0
    }

    private static func niceStep(_ rough: Double) -> Double {
        let exponent = floor(log10(rough))
        let base = pow(10, exponent)
        let fraction = rough / base
        let factor: Double
        switch fraction {
        case ...1: factor = 1
        case ...2: factor = 2
        case ...5: factor = 5
        default: factor = 10
        }
        return factor * base
    }
}
