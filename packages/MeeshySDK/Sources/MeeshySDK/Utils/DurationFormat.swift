import Foundation

/// Horloge « M:SS » du SDK — chiffres latins, minutes cumulées (« 61:35 »),
/// jamais d'heures. Jumelle côté SDK de `LocalizedNumber.duration` (cible app,
/// chiffres localisés) : le SDK ne peut pas l'atteindre, et ses libellés
/// historiques gravent les chiffres latins, ce que cette fonction préserve.
public enum DurationFormat {

    /// Secondes entières, positives et bornées — `.nan`, `.infinity` et les
    /// négatifs rendent 0 ; `Int(1e30)` piégerait à l'exécution.
    public nonisolated static func wholeSeconds(
        from seconds: TimeInterval,
        rounding: FloatingPointRoundingRule = .down
    ) -> Int {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return Int(min(seconds.rounded(rounding), Double(Int32.max)))
    }

    /// « 2:05 » — arrondi `.down` par défaut (la troncature des anciennes copies).
    public nonisolated static func clock(
        _ seconds: TimeInterval,
        rounding: FloatingPointRoundingRule = .down
    ) -> String {
        clock(wholeSeconds: wholeSeconds(from: seconds, rounding: rounding))
    }

    public nonisolated static func clock(wholeSeconds total: Int) -> String {
        let bounded = max(0, total)
        return String(format: "%d:%02d", bounded / 60, bounded % 60)
    }
}
