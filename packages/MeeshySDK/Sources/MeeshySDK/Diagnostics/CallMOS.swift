import Foundation

/// **Le MOS d'un appel** (#11294) : l'E-model simplifié de l'UIT-T G.107, tel
/// que les outils WebRTC l'emploient, ramené de R (0–100) à une note de 1 à 4,5.
///
/// - délai en bouche-à-oreille : la moitié de l'aller-retour, deux fois la
///   gigue (le tampon qui l'absorbe), et le délai du codec ;
/// - dégradation par le délai : faible sous 160 ms, forte au-delà ;
/// - dégradation par la perte : `95 · P / (P + Bpl)`, Opus masquant les pertes
///   (Ie nul, robustesse `lossRobustness`).
///
/// Loi pure, sans état : chaque client l'applique à ses moyennes d'appel.
public enum CallMOS {
    public static let codecDelayMs = 10.0
    public static let lossRobustness = 10.0
    public static let ceiling = 4.5

    public static func estimate(roundTripTimeMs: Double, jitterMs: Double, packetLossPercent: Double) -> Double {
        let delai = finite(roundTripTimeMs) / 2 + 2 * finite(jitterMs) + codecDelayMs
        let parDelai = delai < 160 ? delai / 40 : (delai - 120) / 10
        let perte = min(finite(packetLossPercent), 100)
        let parPerte = 95 * perte / (perte + lossRobustness)
        let r = min(max(93.2 - parDelai - parPerte, 0), 100)
        let mos = 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r)
        return min(max(mos, 1), ceiling)
    }

    /// Une mesure négative ou indéfinie ne dégrade ni n'améliore la note.
    private static func finite(_ value: Double) -> Double {
        value.isFinite ? max(value, 0) : 0
    }
}
