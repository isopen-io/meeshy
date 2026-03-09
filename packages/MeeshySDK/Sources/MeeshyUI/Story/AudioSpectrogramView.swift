import SwiftUI
import Accelerate
import MeeshySDK

// MARK: - Spectrogram Renderer

struct AudioSpectrogramRenderer {

    let fftSize: Int
    let frequencyBands: Int

    init(fftSize: Int = 64, frequencyBands: Int = 32) {
        self.fftSize = fftSize
        self.frequencyBands = frequencyBands
    }

    func computeBins(from samples: [Float]) -> [[Float]] {
        guard samples.count >= fftSize else {
            return []
        }

        let window = vDSP.window(
            ofType: Float.self,
            usingSequence: .hanningDenormalized,
            count: fftSize,
            isHalfWindow: false
        )

        let log2n = vDSP_Length(log2(Float(fftSize)))
        guard let fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            return []
        }
        defer { vDSP_destroy_fftsetup(fftSetup) }

        let halfSize = fftSize / 2
        let hopSize = max(1, (samples.count - fftSize) / max(1, (samples.count / (fftSize / 2))))
        var columns: [[Float]] = []
        var offset = 0

        while offset + fftSize <= samples.count {
            let chunk = Array(samples[offset..<(offset + fftSize)])
            var windowed = [Float](repeating: 0, count: fftSize)
            vDSP.multiply(chunk, window, result: &windowed)

            var realPart = [Float](repeating: 0, count: halfSize)
            var imagPart = [Float](repeating: 0, count: halfSize)

            realPart.withUnsafeMutableBufferPointer { realBuf in
                imagPart.withUnsafeMutableBufferPointer { imagBuf in
                    var splitComplex = DSPSplitComplex(
                        realp: realBuf.baseAddress!,
                        imagp: imagBuf.baseAddress!
                    )

                    windowed.withUnsafeBufferPointer { windowedBuf in
                        windowedBuf.baseAddress!.withMemoryRebound(
                            to: DSPComplex.self,
                            capacity: halfSize
                        ) { complexPtr in
                            vDSP_ctoz(complexPtr, 2, &splitComplex, 1, vDSP_Length(halfSize))
                        }
                    }

                    vDSP_fft_zrip(fftSetup, &splitComplex, 1, log2n, FFTDirection(kFFTDirection_Forward))

                    var magnitudes = [Float](repeating: 0, count: halfSize)
                    vDSP_zvmags(&splitComplex, 1, &magnitudes, 1, vDSP_Length(halfSize))

                    let bandSize = max(1, halfSize / frequencyBands)
                    var bands = [Float](repeating: 0, count: frequencyBands)

                    for band in 0..<frequencyBands {
                        let start = band * bandSize
                        let end = min(start + bandSize, halfSize)
                        guard start < end else {
                            bands[band] = 0
                            continue
                        }
                        var sum: Float = 0
                        vDSP_sve(Array(magnitudes[start..<end]), 1, &sum, vDSP_Length(end - start))
                        bands[band] = sqrtf(sum / Float(end - start))
                    }

                    columns.append(bands)
                }
            }

            offset += max(1, hopSize)
        }

        guard let globalMax = columns.flatMap({ $0 }).max(), globalMax > 0 else {
            return columns
        }

        return columns.map { column in
            column.map { $0 / globalMax }
        }
    }
}

// MARK: - Spectrogram View

struct AudioSpectrogramView: View {

    let samples: [Float]
    let barColor: Color

    @State private var bins: [[Float]] = []

    nonisolated(unsafe) private static let renderer = AudioSpectrogramRenderer(fftSize: 64, frequencyBands: 32)
    private static let trackHeight: CGFloat = 44

    var body: some View {
        Canvas { context, size in
            guard !bins.isEmpty else { return }

            let columnCount = bins.count
            let bandCount = bins[0].count
            let columnWidth = size.width / CGFloat(columnCount)
            let bandHeight = size.height / CGFloat(bandCount)

            let lowColor = MeeshyColors.indigo300
            let highColor = MeeshyColors.indigo600

            for col in 0..<columnCount {
                let column = bins[col]
                for band in 0..<bandCount {
                    let amplitude = CGFloat(column[band])
                    guard amplitude > 0.01 else { continue }

                    let freqRatio = CGFloat(band) / CGFloat(max(1, bandCount - 1))
                    let blendedColor = blendColor(
                        low: lowColor,
                        high: highColor,
                        ratio: freqRatio,
                        alpha: amplitude
                    )

                    let x = CGFloat(col) * columnWidth
                    let y = size.height - CGFloat(band + 1) * bandHeight

                    let rect = CGRect(
                        x: x,
                        y: y,
                        width: columnWidth,
                        height: bandHeight
                    )

                    context.fill(Path(rect), with: .color(blendedColor))
                }
            }
        }
        .frame(height: Self.trackHeight)
        .allowsHitTesting(false)
        .task(id: samples.count) {
            let input = samples
            let result = await Task.detached(priority: .userInitiated) {
                Self.renderer.computeBins(from: input)
            }.value
            bins = result
        }
    }

    private func blendColor(low: Color, high: Color, ratio: CGFloat, alpha: CGFloat) -> Color {
        let clamped = min(max(ratio, 0), 1)
        let resolvedLow = UIColor(low)
        let resolvedHigh = UIColor(high)

        var lr: CGFloat = 0, lg: CGFloat = 0, lb: CGFloat = 0, la: CGFloat = 0
        var hr: CGFloat = 0, hg: CGFloat = 0, hb: CGFloat = 0, ha: CGFloat = 0

        resolvedLow.getRed(&lr, green: &lg, blue: &lb, alpha: &la)
        resolvedHigh.getRed(&hr, green: &hg, blue: &hb, alpha: &ha)

        return Color(
            red: Double(lr + (hr - lr) * clamped),
            green: Double(lg + (hg - lg) * clamped),
            blue: Double(lb + (hb - lb) * clamped)
        )
        .opacity(Double(alpha))
    }
}
