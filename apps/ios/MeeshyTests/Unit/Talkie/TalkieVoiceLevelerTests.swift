import XCTest
@testable import Meeshy

/// La voix du talkie part à un volume normalisé (#20531) : gain automatique vers −16 dBFS, plafonné à +18 dB,
/// gelé sous le plancher, suivi d'un limiteur doux à −1 dBFS.
final class TalkieVoiceLevelerTests: XCTestCase {

    private static let sampleRate = 48_000.0
    private static let frequency = 440.0
    private static let ceilingLinear = Float(pow(10, Double(TalkieVoiceLeveler.ceilingDecibels) / 20))

    private struct Run {
        var output: [Float] = []
        var gains: [Float] = []
    }

    private func sine(rmsDecibels: Float, seconds: Double, phaseOffset: Int = 0) -> [Float] {
        let amplitude = Float(pow(10, Double(rmsDecibels) / 20)) * Float(2.0.squareRoot())
        let count = Int(seconds * Self.sampleRate)
        return (0..<count).map { index in
            amplitude * Float(sin(2 * Double.pi * Self.frequency * Double(index + phaseOffset) / Self.sampleRate))
        }
    }

    private func noise(rmsDecibels: Float, seconds: Double) -> [Float] {
        let amplitude = Float(pow(10, Double(rmsDecibels) / 20)) * Float(3.0.squareRoot())
        var generator = SystemRandomNumberGenerator()
        return (0..<Int(seconds * Self.sampleRate)).map { _ in
            Float.random(in: -amplitude...amplitude, using: &generator)
        }
    }

    private func feed(
        _ signal: [Float],
        through leveler: TalkieVoiceLeveler,
        bufferSize: Int = 1024,
        into run: inout Run
    ) {
        var start = 0
        while start < signal.count {
            var buffer = Array(signal[start..<min(signal.count, start + bufferSize)])
            buffer.withUnsafeMutableBufferPointer { leveler.process($0) }
            run.output.append(contentsOf: buffer)
            run.gains.append(leveler.currentGainDecibels)
            start += bufferSize
        }
    }

    private func rmsDecibels(_ samples: ArraySlice<Float>) -> Float {
        let meanSquare = samples.reduce(Float(0)) { $0 + $1 * $1 } / Float(samples.count)
        return 10 * log10(meanSquare)
    }

    private func lastHalfSecond(_ run: Run) -> ArraySlice<Float> {
        run.output.suffix(Int(0.5 * Self.sampleRate))
    }

    // MARK: - La voix faible remonte vers la cible

    func test_process_quietSpeech_risesTowardTarget() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(sine(rmsDecibels: -28, seconds: 2), through: leveler, into: &run)

        let level = rmsDecibels(lastHalfSecond(run))
        XCTAssertTrue((-19 ... -13).contains(level), "sortie à \(level) dBFS")
        XCTAssertLessThanOrEqual(leveler.currentGainDecibels, TalkieVoiceLeveler.maxGainDecibels)
    }

    func test_process_veryQuietSpeech_gainCappedAtMaximum() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(sine(rmsDecibels: -40, seconds: 2), through: leveler, into: &run)

        XCTAssertLessThanOrEqual(leveler.currentGainDecibels, TalkieVoiceLeveler.maxGainDecibels)
        XCTAssertGreaterThan(leveler.currentGainDecibels, TalkieVoiceLeveler.maxGainDecibels - 1)
        XCTAssertEqual(rmsDecibels(lastHalfSecond(run)), -40 + TalkieVoiceLeveler.maxGainDecibels, accuracy: 1)
    }

    // MARK: - Rien n'écrête

    func test_process_loudSignal_neverExceedsCeiling() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(sine(rmsDecibels: -3.0103, seconds: 2), through: leveler, into: &run)

        let peak = run.output.map(abs).max() ?? 0
        XCTAssertLessThanOrEqual(peak, Self.ceilingLinear)
    }

    func test_process_loudBurstAfterQuietSpeech_neverExceedsCeiling() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(sine(rmsDecibels: -40, seconds: 1), through: leveler, into: &run)
        feed(sine(rmsDecibels: -3.0103, seconds: 1), through: leveler, into: &run)

        let peak = run.output.map(abs).max() ?? 0
        XCTAssertLessThanOrEqual(peak, Self.ceilingLinear)
        XCTAssertLessThan(leveler.currentGainDecibels, 0)
    }

    // MARK: - Le silence n'est jamais remonté

    func test_process_silenceBelowFloor_doesNotAmplifyNoise() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(sine(rmsDecibels: -30, seconds: 1), through: leveler, into: &run)
        XCTAssertGreaterThan(leveler.currentGainDecibels, 10)

        feed(noise(rmsDecibels: -60, seconds: 2), through: leveler, into: &run)
        XCTAssertLessThan(leveler.currentGainDecibels, 1)
    }

    func test_process_silenceFromStart_keepsUnityGain() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        feed(noise(rmsDecibels: -60, seconds: 1), through: leveler, into: &run)

        XCTAssertEqual(leveler.currentGainDecibels, 0, accuracy: 0.01)
    }

    // MARK: - L'état traverse les tampons

    func test_process_stateCarriesAcrossBuffers_noJump() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        let first = sine(rmsDecibels: -24, seconds: 1)
        feed(first, through: leveler, bufferSize: 1024, into: &run)
        feed(sine(rmsDecibels: -24, seconds: 1, phaseOffset: first.count), through: leveler, bufferSize: 512, into: &run)

        let steps = zip(run.gains.dropFirst(), run.gains).map { abs($0 - $1) }
        XCTAssertLessThanOrEqual(steps.max() ?? 0, 1, "saut de gain maximal : \(steps.max() ?? 0) dB")
    }

    func test_process_bufferSize_doesNotChangeTheOutcome() {
        let signal = sine(rmsDecibels: -30, seconds: 1)
        let gains = [512, 1024, 4096, 700].map { size -> Float in
            let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
            var run = Run()
            feed(signal, through: leveler, bufferSize: size, into: &run)
            return leveler.currentGainDecibels
        }
        for gain in gains {
            XCTAssertEqual(gain, gains[0], accuracy: 0.1, "gains selon la taille du tampon : \(gains)")
        }
    }

    // MARK: - Les valeurs non finies sont neutralisées

    func test_process_nanInput_outputsFinite() {
        let leveler = TalkieVoiceLeveler(sampleRate: Self.sampleRate)
        var run = Run()
        var signal = sine(rmsDecibels: -30, seconds: 0.5)
        for index in stride(from: 0, to: signal.count, by: 97) {
            signal[index] = [Float.nan, .infinity, -.infinity][index % 3]
        }
        feed(signal, through: leveler, into: &run)
        feed(sine(rmsDecibels: -30, seconds: 0.5), through: leveler, into: &run)

        XCTAssertTrue(run.output.allSatisfy(\.isFinite))
        XCTAssertTrue(run.gains.allSatisfy(\.isFinite))
        XCTAssertTrue(leveler.currentGainDecibels.isFinite)
    }
}
