import Accelerate
import Foundation

/// La voix du talkie lue en 120 bandes de fréquence (#20531), sur le fil audio : 80 Hz à 8 kHz en échelle
/// logarithmique, chaque bande rendue dans 0…1 — 0 au plancher de `TalkieWaveLaw.floorDecibels`, 1 quand une
/// sinusoïde à pleine échelle tombe dans la bande.
///
/// Tous les tampons sont préparés à la construction ; une trame n'alloue rien tant que l'appelant respecte le
/// contrat de `bands(_:)`.
nonisolated final class TalkieSpectrumAnalyzer {
    static let bandCount = 120
    static let lowestFrequency = 80.0
    static let highestFrequency = 8_000.0

    private static let ceilingDecibels: Float = 20

    private let fftSize: Int
    private let binCount: Int
    private let fft: vDSP.FFT<DSPSplitComplex>
    private let window: [Float]
    private let zeroReference: Float
    private let bandPlan: [TalkieSpectrumBand]

    private let frame: UnsafeMutablePointer<Float>
    private let real: UnsafeMutablePointer<Float>
    private let imaginary: UnsafeMutablePointer<Float>
    private let magnitudes: UnsafeMutablePointer<Float>
    private let decibels: UnsafeMutablePointer<Float>
    private let peakPositions: UnsafeMutablePointer<Float>
    private let peakDecibels: UnsafeMutablePointer<Float>
    private var output: [Float]

    init(sampleRate: Double, fftSize: Int = 1024) {
        precondition(fftSize >= 16 && fftSize & (fftSize - 1) == 0, "fftSize doit être une puissance de deux")
        let log2n = vDSP_Length(fftSize.trailingZeroBitCount)
        guard let fft = vDSP.FFT(log2n: log2n, radix: .radix2, ofType: DSPSplitComplex.self) else {
            preconditionFailure("FFT vDSP indisponible pour \(fftSize) échantillons")
        }
        let binCount = fftSize / 2
        self.fftSize = fftSize
        self.binCount = binCount
        self.fft = fft
        let window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: fftSize, isHalfWindow: false)
        self.window = window
        self.zeroReference = vDSP.sum(window)
        self.bandPlan = Self.plan(binWidth: sampleRate / Double(fftSize), binCount: binCount)
        self.frame = .allocate(capacity: fftSize)
        self.real = .allocate(capacity: binCount)
        self.imaginary = .allocate(capacity: binCount)
        self.magnitudes = .allocate(capacity: binCount)
        self.decibels = .allocate(capacity: binCount)
        self.peakPositions = .allocate(capacity: binCount)
        self.peakDecibels = .allocate(capacity: binCount)
        self.output = [Float](repeating: 0, count: Self.bandCount)
    }

    deinit {
        frame.deallocate()
        real.deallocate()
        imaginary.deallocate()
        magnitudes.deallocate()
        decibels.deallocate()
        peakPositions.deallocate()
        peakDecibels.deallocate()
    }

    /// La bande qui contient `frequency`, bornée aux deux extrémités de l'échelle.
    static func bandIndex(frequency: Double) -> Int {
        guard frequency.isFinite, frequency > lowestFrequency else { return 0 }
        let position = Double(bandCount) * log(frequency / lowestFrequency) / log(highestFrequency / lowestFrequency)
        return min(bandCount - 1, Int((position + 1e-9).rounded(.down)))
    }

    /// Les 120 bandes d'une trame : les échantillons manquants sont complétés de zéros, les valeurs non finies
    /// comptent pour du silence.
    ///
    /// Contrat : le tableau rendu partage le tampon de sortie de l'analyseur. L'appelant le lâche avant la trame
    /// suivante ; s'il le garde, la trame suivante le copie avant de réécrire, et alloue.
    func bands(_ samples: UnsafeBufferPointer<Float>) -> [Float] {
        loadWindowedFrame(samples)
        transform()
        let peakCount = locatePeaks()
        var peak = 0
        output.withUnsafeMutableBufferPointer { bands in
            for (index, band) in bandPlan.enumerated() {
                while peak < peakCount, peakPositions[peak] < band.lower { peak += 1 }
                var level = band.envelopeDecibels(in: decibels)
                var inside = peak
                while inside < peakCount, peakPositions[inside] < band.upper {
                    level = max(level, peakDecibels[inside])
                    inside += 1
                }
                let normalized = (level - TalkieWaveLaw.floorDecibels) / -TalkieWaveLaw.floorDecibels
                bands[index] = min(1, max(0, normalized))
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
        for bin in 0..<binCount { decibels[bin] = toDecibels(magnitudes[bin]) }
    }

    /// Les sommets du spectre — chaque case plus haute que ses deux voisines —, situés et mesurés par
    /// l'estimateur exact de la fenêtre de Hann : une sinusoïde y retrouve sa fréquence et son niveau, quelle
    /// que soit sa place entre deux cases.
    private func locatePeaks() -> Int {
        var count = 0
        for bin in 1..<(binCount - 1) {
            let center = magnitudes[bin]
            let left = magnitudes[bin - 1]
            let right = magnitudes[bin + 1]
            guard center > left, center >= right else { continue }
            let ratio = max(left, right) / center
            let offset = min(0.5, max(0, (2 * ratio - 1) / (ratio + 1)))
            let signedOffset = right >= left ? offset : -offset
            peakPositions[count] = Float(bin) + signedOffset
            peakDecibels[count] = toDecibels(center / Self.hannResponse(at: offset))
            count += 1
        }
        return count
    }

    private func toDecibels(_ magnitude: Float) -> Float {
        guard magnitude > 0 else { return TalkieWaveLaw.floorDecibels - 10 }
        let level = 20 * log10(magnitude / zeroReference)
        return min(Self.ceilingDecibels, max(TalkieWaveLaw.floorDecibels - 10, level))
    }

    /// Réponse de la fenêtre de Hann à une sinusoïde décalée de `offset` case, 1 au centre.
    private static func hannResponse(at offset: Float) -> Float {
        guard offset > 1e-6 else { return 1 }
        let phase = Float.pi * offset
        return sin(phase) / phase / (1 - offset * offset)
    }

    private static func plan(binWidth: Double, binCount: Int) -> [TalkieSpectrumBand] {
        let ratio = highestFrequency / lowestFrequency
        let edges = (0...bandCount).map { lowestFrequency * pow(ratio, Double($0) / Double(bandCount)) / binWidth }
        return (0..<bandCount).map { band in
            TalkieSpectrumBand(lower: edges[band], upper: edges[band + 1], binCount: binCount)
        }
    }
}

/// L'étendue d'une bande, en cases de FFT. Hors des sommets, son niveau est celui de l'enveloppe du spectre —
/// les cases qu'elle couvre, et l'interpolation linéaire entre cases voisines à ses deux bords.
nonisolated private struct TalkieSpectrumBand {
    let lower: Float
    let upper: Float
    let firstBin: Int
    let coveredBins: Int
    let lastBin: Int

    init(lower: Double, upper: Double, binCount: Int) {
        self.lower = Float(lower)
        self.upper = Float(upper)
        lastBin = binCount - 1
        let first = min(lastBin, Int(lower.rounded(.up)))
        firstBin = first
        coveredBins = max(0, min(binCount, Int(upper.rounded(.up))) - first)
    }

    func envelopeDecibels(in spectrum: UnsafeMutablePointer<Float>) -> Float {
        var level = max(interpolated(spectrum, at: lower), interpolated(spectrum, at: upper))
        if coveredBins > 0 {
            var covered: Float = 0
            vDSP_maxv(spectrum + firstBin, 1, &covered, vDSP_Length(coveredBins))
            level = max(level, covered)
        }
        return level
    }

    private func interpolated(_ spectrum: UnsafeMutablePointer<Float>, at position: Float) -> Float {
        let base = min(lastBin - 1, max(0, Int(position)))
        let fraction = min(1, max(0, position - Float(base)))
        return spectrum[base] * (1 - fraction) + spectrum[base + 1] * fraction
    }
}
