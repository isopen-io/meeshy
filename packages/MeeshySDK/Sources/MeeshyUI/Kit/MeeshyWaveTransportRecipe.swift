import Foundation

/// **K35 hors du son** : deux variantes du lecteur qui ne jouent pas un vocal.
///
/// - `transport` : relire AUTRE CHOSE qu'un son (un trajet, une chronologie) — lecture /
///   pause, une piste à repères (K05), un pouce, l'heure courante, dans une capsule de verre.
/// - `indicator` : l'onde seule, sans lecture ni durée — un égaliseur qui dit « ça joue ».
public nonisolated enum MeeshyWavePlayerVariant: String, Sendable, Equatable, CaseIterable {
    case transport
    case indicator
}

/// **La recette de la variante `transport` en VALEURS** : la capsule, le bouton, les
/// repères et leur place sur la piste. Aucune vue, aucune couleur.
public nonisolated struct MeeshyWaveTransportRecipe: Sendable, Equatable {
    /// Le disque lecture / pause : 44, une cible pleine.
    public static let buttonSize: Double = 44
    /// L'écart entre bouton, piste et heure.
    public static let gap: Double = 14
    /// La capsule : 10 au début (le disque touche presque le bord), 16 à la fin, 10 en haut et en bas.
    public static let leadingInset: Double = 10
    public static let trailingInset: Double = 16
    public static let verticalInset: Double = 10
    /// Un repère : un trait de 3 sur 10, sous le pouce.
    public static let markerWidth: Double = 3
    public static let markerHeight: Double = 10
    /// La hauteur de la capsule : le disque et ses deux marges.
    public static var height: Double { buttonSize + 2 * verticalInset }

    /// Les repères tels qu'on les pose : finis, bornés à 0…1, triés, sans doublon.
    public static func markers(_ fractions: [Double]) -> [Double] {
        let bounded = fractions.filter(\.isFinite).map { min(max($0, 0), 1) }
        return Array(Set(bounded)).sorted()
    }

    /// Le centre d'un repère sur une piste de `width` : il suit la course du pouce
    /// (de `inset` à `width − inset`), reflété en arabe.
    public static func markerCenter(fraction: Double, width: Double, inset: Double, isRightToLeft: Bool) -> Double {
        guard width.isFinite, inset.isFinite, fraction.isFinite else { return 0 }
        let usable = max(width - 2 * inset, 0)
        let share = min(max(fraction, 0), 1)
        return inset + usable * (isRightToLeft ? 1 - share : share)
    }

    /// Le glyphe du disque : pause pendant la lecture, lecture sinon.
    public static func glyph(isPlaying: Bool) -> String {
        isPlaying ? "pause.fill" : "play.fill"
    }

    /// Le nom du disque : ce qu'il FERA, jamais l'état.
    public static func toggleLabel(isPlaying: Bool, play: String, pause: String) -> String {
        isPlaying ? pause : play
    }
}

/// **La recette de la variante `indicator`** : une onde courte, sans lecture ni durée.
public nonisolated struct MeeshyWaveIndicatorRecipe: Sendable, Equatable {
    /// L'égaliseur par défaut : cinq barres de 16.
    public static let defaultBars: Int = 5
    public static let height: Double = 16
    public static let minimumBars: Int = 3
    public static let maximumBars: Int = 24

    /// Le nombre de barres borné de 3 à 24.
    public static func bars(_ requested: Int) -> Int {
        min(max(requested, minimumBars), maximumBars)
    }

    /// La largeur de l'onde : une barre par pas de la loi des barres.
    public static func width(bars: Int) -> Double {
        Double(Self.bars(bars)) * MeeshyWaveBarsLaw.pitch
    }

    /// La silhouette d'un égaliseur quand l'hôte ne sert aucun niveau : une crête au milieu.
    public static func equalizerLevels(bars: Int) -> [Float] {
        let count = Self.bars(bars)
        let middle = Double(count - 1) / 2
        return (0..<count).map { index in
            let distance = middle > 0 ? abs(Double(index) - middle) / middle : 0
            return Float(1 - 0.5 * distance)
        }
    }
}
