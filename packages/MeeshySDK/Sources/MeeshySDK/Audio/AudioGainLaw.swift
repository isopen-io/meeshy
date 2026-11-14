import Foundation
import Accelerate

/// **Un vocal s'entend à 120 %** (#18526, directive porteur). `AVAudioPlayer`
/// plafonne son volume à 1 : le gain se pose sur les ÉCHANTILLONS avant la
/// lecture, et chaque échantillon reste borné à ±1 — un pic déjà à pleine
/// échelle écrête plutôt que de déborder. Une loi pure : rien ici ne lit un
/// fichier ni une session.
public enum AudioGainLaw {
    /// Le facteur appliqué à toute lecture du moteur audio : 1,2 = 120 %.
    public static let playbackGain: Float = 1.2

    /// Au-delà de cette durée, l'original joue sans gain : décoder un fichier
    /// entier en PCM pour l'amplifier coûte sa taille en mémoire.
    public static let maxAmplifiedDuration: TimeInterval = 180

    /// Un gain de 1 (ou un gain invalide) ne touche pas aux octets.
    public static func isIdentity(_ gain: Float) -> Bool {
        !gain.isFinite || gain <= 0 || abs(gain - 1) < 0.0001
    }

    /// Les échantillons multipliés par `gain`, bornés à ±1.
    public static func amplified(_ samples: [Float], gain: Float) -> [Float] {
        guard !samples.isEmpty, !isIdentity(gain) else { return samples }
        let scaled = vDSP.multiply(gain, samples)
        return vDSP.clip(scaled, to: -1...1)
    }

    /// Même règle, en place, sur un tampon C (le format de `AVAudioPCMBuffer`).
    public static func amplify(_ pointer: UnsafeMutablePointer<Float>, count: Int, gain: Float) {
        guard count > 0, !isIdentity(gain) else { return }
        var g = gain
        vDSP_vsmul(pointer, 1, &g, pointer, 1, vDSP_Length(count))
        var low: Float = -1, high: Float = 1
        vDSP_vclip(pointer, 1, &low, &high, pointer, 1, vDSP_Length(count))
    }

    /// Plafonds de format : au-delà, l'original joue sans gain. Un média reçu
    /// d'autrui décide de son format — pas de sa place en mémoire chez nous.
    public static let maxSampleRate: Double = 96_000
    public static let maxChannels: UInt32 = 2
    /// Taille d'un tronçon de traitement (en images) : la mémoire tenue par le
    /// rendu est celle d'UN tronçon, jamais celle du fichier.
    public static let chunkFrames: UInt32 = 32_768

    /// Un fichier se laisse amplifier s'il est borné en durée ET en format.
    public static func mayAmplify(frameCount: Int64, sampleRate: Double, channelCount: UInt32) -> Bool {
        guard sampleRate > 0, sampleRate <= maxSampleRate,
              channelCount >= 1, channelCount <= maxChannels,
              frameCount > 0, frameCount <= Int64(UInt32.max) else { return false }
        return Double(frameCount) / sampleRate <= maxAmplifiedDuration
    }
}
