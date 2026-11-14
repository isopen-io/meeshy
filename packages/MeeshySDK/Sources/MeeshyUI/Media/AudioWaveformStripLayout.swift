import Foundation

/// **L'onde du vocal se lit grande, et la puce ne la couvre pas** (#18526,
/// directive porteur). Le ruban de l'onde a deux bandes : en haut les barres,
/// amplifiées par une courbe perceptive franche ; en bas la puce « durée /
/// décompte + pourcentage », qui ne recouvre donc aucune barre pendant
/// qu'un son sort. Une loi pure : la vue ne calcule aucune hauteur elle-même.
nonisolated public enum AudioWaveformStripLayout {
    /// Hauteur totale du ruban (barres + bande de la puce).
    public static let stripHeight: CGFloat = 46
    /// La bande haute, celle des barres.
    public static let barsHeight: CGFloat = 28
    /// La bande basse, celle de la puce — tout ce que le ruban a sous les barres.
    public static var chipBandHeight: CGFloat { stripHeight - barsHeight }

    public static let barMinHeight: CGFloat = 3
    /// Les barres montent jusqu'au bord de leur bande, moins une marge d'un point.
    public static var barMaxHeight: CGFloat { barsHeight - 2 }
    /// Exposant de la courbe perceptive : 0,5 relève les passages calmes bien
    /// plus que l'ancien 0,65 — l'onde se lit « amplifiée ».
    public static let amplitudeCurve: Double = 0.5

    /// Hauteur d'une barre pour une amplitude normalisée `0…1`.
    public static func barHeight(normalized: Double) -> CGFloat {
        guard normalized.isFinite else { return barMinHeight }
        let clamped = max(0, min(1, normalized))
        return max(barMinHeight, CGFloat(pow(clamped, amplitudeCurve)) * barMaxHeight)
    }

    /// La forme procédurale servie tant que les vrais échantillons se décodent.
    public static func placeholderHeight(index: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let base = 0.3 + sin(seed) * 0.25 + cos(seed * 0.5) * 0.15
        return barHeight(normalized: base)
    }
}
