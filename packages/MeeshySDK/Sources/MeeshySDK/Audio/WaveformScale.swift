import Accelerate
import CoreGraphics
import Foundation

// MARK: - Les échelles d'une forme d'onde

/// **Deux données, deux échelles, jamais l'une sur l'autre.**
///
/// - La MESURE (`WaveformCache`) est un RMS absolu : `displayHeight(rms:)` la rend
///   lisible en décibels. Un RMS linéaire est visuellement plat — la plupart des
///   contenus vivent entre 0,05 et 0,3.
/// - Le CHAMP PUBLIÉ (`StoryAudioPlayerObject.waveformSamples`, `Sound.waveform`
///   côté serveur et web) est normalisé au pic et se lit en linéaire :
///   `peakNormalized(_:)` l'écrit, `publishedHeight(_:)` le lit.
public enum WaveformScale {

    /// Plancher de l'échelle décibel : en dessous, c'est le silence.
    private static let floorDecibels: Float = -60

    /// Hauteur d'affichage `0...1` pour un RMS absolu, en échelle décibel.
    public static func displayHeight(rms: Float) -> Float {
        guard rms > 0.0001 else { return 0 }
        let decibels = 20 * log10f(min(1, rms))
        return max(0, min(1, (decibels - floorDecibels) / -floorDecibels))
    }

    /// Paliers de résolution : un `count` variant continûment avec le zoom
    /// multiplierait les entrées de cache et relancerait une analyse à chaque
    /// image d'un pincement. La quantification est ce qui rend le cache utile.
    public static let bucketTiers: [Int] = [128, 256, 512, 1024, 2048]

    /// Palier couvrant une barre de `width` points à l'échelle écran `scale`.
    public static func bucketCount(forWidth width: CGFloat, scale: CGFloat) -> Int {
        let target = Int((width * max(1, scale)).rounded())
        return bucketTiers.first { $0 >= target } ?? 2048
    }

    /// La mesure ramenée au contrat du champ publié : la crête vaut 1. Un signal
    /// silencieux reste à zéro (pas de division par ~0 qui amplifierait le bruit).
    public static func peakNormalized(_ rms: [Float]) -> [Float] {
        guard !rms.isEmpty else { return [] }
        let peak = vDSP.maximum(rms)
        guard peak > 0.0001 else { return rms.map { _ in 0 } }
        return vDSP.divide(rms, peak)
    }

    /// Hauteur `0...1` d'une valeur du champ publié : déjà normalisée, donc
    /// linéaire — aucune seconde échelle par-dessus.
    public static func publishedHeight(_ value: Float) -> Float {
        max(0, min(1, value))
    }
}

// MARK: - La lecture d'une série

/// **Ce qu'une série de valeurs EST décide de l'échelle qui la lit.** Une vue qui
/// reçoit tantôt la mesure, tantôt le champ publié (une barre de timeline dont le
/// repli est le champ d'un repost) déclare laquelle elle dessine.
public enum WaveformReading: Sendable, Equatable {
    /// La mesure du cache, RMS absolu : échelle décibel.
    case measured
    /// Le champ publié, normalisé au pic : linéaire.
    case published

    /// Hauteur `0...1` d'une valeur de la série.
    public func height(_ value: Float) -> Float {
        switch self {
        case .measured: return WaveformScale.displayHeight(rms: value)
        case .published: return WaveformScale.publishedHeight(value)
        }
    }
}
