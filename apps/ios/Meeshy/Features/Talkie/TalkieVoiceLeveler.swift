import Accelerate
import Foundation

/// La voix du talkie à un volume normalisé (#20531), sur le fil audio : un gain automatique la porte vers
/// −16 dBFS de moyenne quadratique, plafonné à +18 dB, puis un limiteur doux la borne à −1 dBFS.
///
/// Le gain monte lentement (constante de 300 ms) et redescend vite (20 ms). Dès qu'une tranche tombe sous le
/// plancher de `TalkieWaveLaw.floorDecibels`, il est gelé à sa dernière valeur, puis rejoint 0 dB en 1 s : le
/// silence n'est jamais remonté en souffle. Il n'en ressort qu'au-dessus de −47 dBFS, pour qu'un souffle posé
/// sur le plancher ne batte pas entre gel et montée.
///
/// Le traitement se fait sur place, par tranches de 256 échantillons au plus, et garde son état d'un tampon à
/// l'autre quelle que soit leur taille. Il n'alloue rien.
nonisolated final class TalkieVoiceLeveler {
    static let targetDecibels: Float = -16
    static let maxGainDecibels: Float = 18
    static let ceilingDecibels: Float = -1

    static let minGainDecibels: Float = -24
    static let kneeDecibels: Float = -6

    private static let sliceLength = 256
    private static let detectorAttack: Float = 0.010
    private static let detectorRelease: Float = 0.100
    private static let riseTime: Float = 0.300
    private static let fallTime: Float = 0.020
    private static let holdTime: Float = 0.200
    private static let releaseToUnityTime: Float = 1
    private static let silentPower: Float = 1e-12
    private static let hysteresisDecibels: Float = 3

    private var sampleRate: Float
    private let floorPower: Float
    private let wakePower: Float
    private let knee: Float
    private let ceiling: Float

    private var detectedPower: Float = 0
    private var gainDecibels: Float = 0
    private var gainLinear: Float = 1
    private var silentFor: Float = 0
    private var releaseRate: Float = 0
    private var isSilent = true

    var currentGainDecibels: Float { gainDecibels }

    init(sampleRate: Double) {
        precondition(sampleRate.isFinite && sampleRate > 0, "sampleRate doit être positif")
        self.sampleRate = Float(sampleRate)
        floorPower = Self.power(decibels: TalkieWaveLaw.floorDecibels)
        wakePower = Self.power(decibels: TalkieWaveLaw.floorDecibels + Self.hysteresisDecibels)
        knee = Self.amplitude(decibels: Self.kneeDecibels)
        ceiling = Self.amplitude(decibels: Self.ceilingDecibels)
    }

    /// Suit un changement de route (Bluetooth HFP à 16 ou 24 kHz…) sans rien perdre de l'état : le gain continue
    /// d'où il était, seules les constantes de temps se recalent. Une fréquence non finie ou nulle est ignorée.
    func updateSampleRate(_ sampleRate: Double) {
        guard sampleRate.isFinite, sampleRate > 0 else { return }
        self.sampleRate = Float(sampleRate)
    }

    /// Normalise `samples` sur place ; une valeur non finie y devient du silence.
    func process(_ samples: UnsafeMutableBufferPointer<Float>) {
        guard var base = samples.baseAddress else { return }
        withUnsafeMutablePointer(to: &base) { process(channels: $0, channelCount: 1, frameCount: samples.count) }
    }

    /// Normalise sur place `channelCount` canaux de `frameCount` échantillons d'un MÊME gain : le niveau se mesure
    /// sur leur moyenne, puis chaque canal reçoit la même rampe et le même limiteur.
    func process(channels: UnsafePointer<UnsafeMutablePointer<Float>>, channelCount: Int, frameCount: Int) {
        guard channelCount > 0 else { return }
        var offset = 0
        while offset < frameCount {
            let length = min(Self.sliceLength, frameCount - offset)
            processSlice(channels, channelCount: channelCount, offset: offset, length: length)
            offset += length
        }
    }

    private func processSlice(_ channels: UnsafePointer<UnsafeMutablePointer<Float>>, channelCount: Int, offset: Int, length: Int) {
        let elapsed = Float(length) / sampleRate
        var meanSquare: Float = 0
        for channel in 0..<channelCount {
            let slice = channels[channel] + offset
            for index in 0..<length where !slice[index].isFinite { slice[index] = 0 }
            var channelMeanSquare: Float = 0
            vDSP_measqv(slice, 1, &channelMeanSquare, vDSP_Length(length))
            meanSquare += channelMeanSquare / Float(channelCount)
        }
        detect(meanSquare, elapsed: elapsed)
        isSilent = isSilent ? meanSquare <= wakePower : meanSquare < floorPower
        if isSilent {
            holdThenRelease(elapsed: elapsed)
        } else {
            follow(elapsed: elapsed)
        }
        let target = Self.amplitude(decibels: gainDecibels)
        for channel in 0..<channelCount {
            let slice = channels[channel] + offset
            applyGain(slice, length: length, target: target)
            limit(slice, length: length)
        }
        gainLinear = target
    }

    private func detect(_ meanSquare: Float, elapsed: Float) {
        let time = meanSquare > detectedPower ? Self.detectorAttack : Self.detectorRelease
        detectedPower += (meanSquare - detectedPower) * Self.smoothing(elapsed: elapsed, time: time)
    }

    private func follow(elapsed: Float) {
        silentFor = 0
        let level = 10 * log10(max(detectedPower, Self.silentPower))
        let wanted = min(Self.maxGainDecibels, max(Self.minGainDecibels, Self.targetDecibels - level))
        let time = wanted > gainDecibels ? Self.riseTime : Self.fallTime
        gainDecibels += (wanted - gainDecibels) * Self.smoothing(elapsed: elapsed, time: time)
    }

    private func holdThenRelease(elapsed: Float) {
        if silentFor == 0 { releaseRate = abs(gainDecibels) / Self.releaseToUnityTime }
        silentFor += elapsed
        guard silentFor > Self.holdTime else { return }
        let step = releaseRate * elapsed
        gainDecibels = abs(gainDecibels) <= step ? 0 : gainDecibels - step * (gainDecibels > 0 ? 1 : -1)
    }

    private func applyGain(_ slice: UnsafeMutablePointer<Float>, length: Int, target: Float) {
        var start = gainLinear
        var step = (target - gainLinear) / Float(length)
        vDSP_vrampmul(slice, 1, &start, &step, slice, 1, vDSP_Length(length))
    }

    /// Courbe `tanh` au-dessus du genou de −6 dBFS, tangente à l'identité au genou et asymptote au plafond.
    private func limit(_ slice: UnsafeMutablePointer<Float>, length: Int) {
        let headroom = ceiling - knee
        for index in 0..<length {
            let sample = slice[index]
            let magnitude = abs(sample)
            guard magnitude > knee else { continue }
            let squashed = min(ceiling, knee + headroom * tanh((magnitude - knee) / headroom))
            slice[index] = sample < 0 ? -squashed : squashed
        }
    }

    private static func smoothing(elapsed: Float, time: Float) -> Float {
        1 - exp(-elapsed / time)
    }

    private static func amplitude(decibels: Float) -> Float {
        pow(10, decibels / 20)
    }

    private static func power(decibels: Float) -> Float {
        pow(10, decibels / 10)
    }
}
