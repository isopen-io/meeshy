import Foundation
import MeeshySDK

/// **Reliquat, sans logique propre.** L'extracteur, le cache et l'échelle vivent
/// dans le SDK : `WaveformCache` (la mesure), `WaveformScale` (l'affichage).
///
/// Il ne subsiste que pour `MeeshyAudioTrimmer`, dont la retouche est tenue par
/// la PR #11395 ; le tour suivant son appelant migré, ce fichier disparaît.
public enum AudioWaveform {

    public nonisolated static func displayHeight(rms: Float) -> Float {
        WaveformScale.displayHeight(rms: rms)
    }

    static func samples(url: URL, count: Int = 80) async -> [Float] {
        (try? await WaveformCache.shared.samples(from: url, count: count)) ?? []
    }
}
