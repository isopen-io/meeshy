import XCTest
@testable import Meeshy

/// La voix du talkie lue en 120 bandes de fréquence (#20531), de 80 Hz à 8 kHz sur une échelle logarithmique.
final class TalkieSpectrumAnalyzerTests: XCTestCase {

    private static let sampleRate = 48_000.0

    private func sine(frequency: Double, amplitude: Float = 1, count: Int = 1024) -> [Float] {
        (0..<count).map { index in
            amplitude * Float(sin(2 * Double.pi * frequency * Double(index) / Self.sampleRate))
        }
    }

    private func analyze(_ samples: [Float]) -> [Float] {
        let analyzer = TalkieSpectrumAnalyzer(sampleRate: Self.sampleRate)
        return samples.withUnsafeBufferPointer { analyzer.bands($0) }
    }

    private func argmax(_ values: [Float]) -> Int {
        values.indices.max { values[$0] < values[$1] } ?? -1
    }

    private func assertAllFiniteInUnitRange(_ bands: [Float], file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(bands.count, TalkieSpectrumAnalyzer.bandCount, file: file, line: line)
        for (index, value) in bands.enumerated() {
            XCTAssertTrue(value.isFinite, "bande \(index) : \(value)", file: file, line: line)
            XCTAssertTrue((0...1).contains(value), "bande \(index) : \(value)", file: file, line: line)
        }
    }

    // MARK: - Une voix pure tombe dans sa bande

    func test_bands_sine200Hz_peaksInItsBand() {
        let bands = analyze(sine(frequency: 200))
        XCTAssertEqual(argmax(bands), TalkieSpectrumAnalyzer.bandIndex(frequency: 200))
    }

    func test_bands_sine4kHz_peaksInItsBand() {
        let bands = analyze(sine(frequency: 4_000))
        XCTAssertEqual(argmax(bands), TalkieSpectrumAnalyzer.bandIndex(frequency: 4_000))
    }

    // MARK: - Calibrage : 1 à pleine échelle, linéaire en décibels jusqu'au plancher

    func test_bands_fullScaleSine_reachesOneInItsBand() {
        let bands = analyze(sine(frequency: 1_500))
        XCTAssertEqual(bands[TalkieSpectrumAnalyzer.bandIndex(frequency: 1_500)], 1, accuracy: 0.02)
    }

    func test_bands_sineAtMinus20dB_landsAtSixTenths() {
        let bands = analyze(sine(frequency: 1_500, amplitude: 0.1))
        XCTAssertEqual(bands[TalkieSpectrumAnalyzer.bandIndex(frequency: 1_500)], 0.6, accuracy: 0.02)
    }

    // MARK: - Entrées dégénérées

    func test_bands_silence_allZero() {
        let bands = analyze([Float](repeating: 0, count: 1024))
        XCTAssertEqual(bands, [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount))
    }

    func test_bands_partialBuffer_returns120Finite() {
        assertAllFiniteInUnitRange(analyze(sine(frequency: 440, count: 300)))
    }

    func test_bands_nanInput_returns120Finite() {
        var samples = sine(frequency: 440)
        samples[3] = .nan
        samples[100] = .infinity
        samples[500] = -.infinity
        assertAllFiniteInUnitRange(analyze(samples))
    }

    func test_bands_successiveFrames_reuseTheAnalyzer() {
        let analyzer = TalkieSpectrumAnalyzer(sampleRate: Self.sampleRate)
        let loud = sine(frequency: 4_000)
        let silence = [Float](repeating: 0, count: 1024)
        _ = loud.withUnsafeBufferPointer { analyzer.bands($0) }
        let after = silence.withUnsafeBufferPointer { analyzer.bands($0) }
        XCTAssertEqual(after, [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount))
    }

    // MARK: - L'échelle logarithmique des bandes

    func test_bandIndex_logScale_endsMatch() {
        XCTAssertEqual(TalkieSpectrumAnalyzer.bandIndex(frequency: 80), 0)
        XCTAssertEqual(TalkieSpectrumAnalyzer.bandIndex(frequency: 8_000), TalkieSpectrumAnalyzer.bandCount - 1)
        let indices = stride(from: 80.0, through: 8_000, by: 10).map { TalkieSpectrumAnalyzer.bandIndex(frequency: $0) }
        XCTAssertEqual(indices, indices.sorted())
        XCTAssertEqual(TalkieSpectrumAnalyzer.bandIndex(frequency: 800), 60)
    }
}
