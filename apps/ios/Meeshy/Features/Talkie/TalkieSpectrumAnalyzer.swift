import Accelerate
import Foundation

/// La voix du talkie lue en 120 bandes de fréquence (#20531), sur le fil audio : 80 Hz à 8 kHz en échelle
/// logarithmique, chaque bande rendue dans 0…1 — 0 au plancher de `TalkieWaveLaw.floorDecibels`, 1 quand une
/// sinusoïde à pleine échelle tombe dans la bande.
///
/// Tous les tampons sont préparés à la construction : une trame n'alloue rien, sauf si l'appelant garde encore le
/// tableau rendu par la trame précédente (il est alors copié avant d'être réécrit).
nonisolated final class TalkieSpectrumAnalyzer {
    static let bandCount = 120
    static let lowestFrequency = 80.0
    static let highestFrequency = 8_000.0

    private let fftSize: Int
    private let binCount: Int
    private let fft: vDSP.FFT<DSPSplitComplex>
    private let window: [Float]
    private let zeroReference: Float
    private let bandPlan: [BandSpan]

    private let frame: UnsafeMutablePointer<Float>
    private let real: UnsafeMutablePointer<Float>
    private let imaginary: UnsafeMutablePointer<Float>
    private let magnitudes: UnsafeMutablePointer<Float>
    private let decibels: UnsafeMutablePointer<Float>
    private var output: [Float]

    init(sampleRate: Double, fftSize: Int = 1024) {
        precondition(fftSize >= 16 && fftSize & (fftSize - 1) == 0, "fftSize doit être une puissance de deux")
        let log2n = vDSP_Length(fftSize.trailingZeroBitCount)
        guard let fft = vDSP.FFT(log2n: log2n, radix: .radix2, ofType: DSPSplitComplex.self) else {
            preconditionFailure("FFT vDSP indisponible pour \(fftSize) échantillons")
        }
        self.fftSize = fftSize
        self.binCount = fftSize / 2
        self.fft = fft
        let window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: fftSize, isHalfWindow: false)
        self.window = window
        self.zeroReference = vDSP.sum(window)
        self.bandPlan = Self.plan(binWidth: sampleRate / Double(fftSize), binCount: fftSize / 2)
        self.frame = .allocate(capacity: fftSize)
        self.real = .allocate(capacity: fftSize / 2)
        self.imaginary = .allocate(capacity: fftSize / 2)
        self.magnitudes = .allocate(capacity: fftSize / 2)
        self.decibels = .allocate(capacity: fftSize / 2)
        self.output = [Float](repeating: 0, count: Self.bandCount)
    }

    deinit {
        frame.deallocate()
        real.deallocate()
        imaginary.deallocate()
        magnitudes.deallocate()
        decibels.deallocate()
    }

    /// La bande qui contient `frequency`, bornée aux deux extrémités de l'échelle.
    static func bandIndex(frequency: Double) -> Int {
        guard frequency.isFinite, frequency > lowestFrequency else { return 0 }
        let position = Double(bandCount) * log(frequency / lowestFrequency) / log(highestFrequency / lowestFrequency)
        return min(bandCount - 1, Int((position + 1e-9).rounded(.down)))
    }

    /// Les 120 bandes d'une trame : les échelons manquants sont complétés de zéros, les valeurs non finies
    /// comptent pour du silence.
    func bands(_ samples: UnsafeBufferPointer<Float>) -> [Float] {
        loadWindowedFrame(samples)
        transform()
        output.withUnsafeMutableBufferPointer { bands in
            for (index, span) in bandPlan.enumerated() {
                let level = (span.decibels(in: decibels) - TalkieWaveLaw.floorDecibels) / -TalkieWaveLaw.floorDecibels
                bands[index] = min(1, max(0, level))
            }
        }
        return output
    }

    private func loadWindowedFrame(_ samples: UnsafeBufferPointer<Float>) {
        let used = min(samples.count, fftSize)
        for index in 0..<fftSize {
            let sample = index < used ? samples[index] : 0
            frame[index] = sample.isFinite ? sample * window[index] : 0
        }
    }

    private func transform() {
        var split = DSPSplitComplex(realp: real, imagp: imaginary)
        frame.withMemoryRebound(to: DSPComplex.self, capacity: binCount) { interleaved in
            vDSP_ctoz(interleaved, 2, &split, 1, vDSP_Length(binCount))
        }
        fft.forward(input: split, output: &split)
        vDSP_zvabs(&split, 1, magnitudes, 1, vDSP_Length(binCount))
        magnitudes[0] = abs(real[0])
        var reference = zeroReference
        vDSP_vdbcon(magnitudes, 1, &reference, decibels, 1, vDSP_Length(binCount), 1)
        var low = TalkieWaveLaw.floorDecibels - 10
        var high = Float(20)
        vDSP_vclip(decibels, 1, &low, &high, decibels, 1, vDSP_Length(binCount))
    }

    private static func plan(binWidth: Double, binCount: Int) -> [BandSpan] {
        let ratio = highestFrequency / lowestFrequency
        let edges = (0...bandCount).map { lowestFrequency * pow(ratio, Double($0) / Double(bandCount)) / binWidth }
        return (0..<bandCount).map { band in
            BandSpan(lower: edges[band], upper: edges[band + 1], binCount: binCount)
        }
    }
}

/// Les cases de la FFT qu'une bande couvre — ou, quand elle est plus étroite qu'une case, la parabole qui passe
/// par les trois cases les plus proches, lue sur l'étendue de la bande.
nonisolated private struct BandSpan {
    let firstBin: Int
    let coveredBins: Int
    let centerBin: Int
    let lowerOffset: Float
    let upperOffset: Float

    init(lower: Double, upper: Double, binCount: Int) {
        let first = min(binCount - 1, Int(lower.rounded(.up)))
        let end = min(binCount, Int(upper.rounded(.up)))
        firstBin = first
        coveredBins = max(0, end - first)
        let center = min(binCount - 2, max(1, Int(((lower + upper) / 2).rounded())))
        centerBin = center
        lowerOffset = Float(lower - Double(center))
        upperOffset = Float(upper - Double(center))
    }

    func decibels(in spectrum: UnsafeMutablePointer<Float>) -> Float {
        guard coveredBins == 0 else {
            var peak: Float = 0
            vDSP_maxv(spectrum + firstBin, 1, &peak, vDSP_Length(coveredBins))
            return peak
        }
        let before = spectrum[centerBin - 1]
        let at = spectrum[centerBin]
        let after = spectrum[centerBin + 1]
        let slope = (after - before) / 2
        let curvature = (after + before) / 2 - at
        let value = { (offset: Float) in at + slope * offset + curvature * offset * offset }
        var peak = max(value(lowerOffset), value(upperOffset))
        if curvature < 0 {
            let vertex = -slope / (2 * curvature)
            if vertex > lowerOffset, vertex < upperOffset { peak = max(peak, value(vertex)) }
        }
        return peak
    }
}
