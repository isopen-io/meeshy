import XCTest
@testable import MeeshySDK

/// La mesure d'une forme d'onde est UNE fonction pure : un RMS par compartiment,
/// calculé par `vDSP_rmsqv`. Aucun fichier, aucun cache — c'est ce qui permet de
/// dire « même signal ⇒ mêmes échantillons » sans poser un seul octet sur disque.
final class WaveformMathTests: XCTestCase {

    func test_rmsBuckets_constantSignal_everyBucketEqualsTheAmplitude() {
        let signal = [Float](repeating: 0.5, count: 1000)

        let buckets = WaveformMath.rmsBuckets(of: signal, count: 10)

        XCTAssertEqual(buckets.count, 10)
        buckets.forEach { XCTAssertEqual($0, 0.5, accuracy: 0.0001) }
    }

    func test_rmsBuckets_silenceThenLoud_isAbsoluteNotPeakNormalised() {
        let signal = [Float](repeating: 0, count: 500) + [Float](repeating: 0.2, count: 500)

        let buckets = WaveformMath.rmsBuckets(of: signal, count: 2)

        XCTAssertEqual(buckets[0], 0, accuracy: 0.0001)
        XCTAssertEqual(buckets[1], 0.2, accuracy: 0.0001,
                       "une piste douce reste douce : la mesure n'est pas divisée par son pic")
    }

    func test_rmsBuckets_signIsIrrelevant_squareWaveHasItsAmplitudeAsRMS() {
        let signal = (0..<800).map { $0 % 2 == 0 ? Float(0.4) : Float(-0.4) }

        let buckets = WaveformMath.rmsBuckets(of: signal, count: 4)

        buckets.forEach { XCTAssertEqual($0, 0.4, accuracy: 0.0001) }
    }

    func test_rmsBuckets_sineOfUnitAmplitude_isAboutOneOverRootTwo() {
        let signal = (0..<44_100).map { Float(sin(2 * Double.pi * 440 * Double($0) / 44_100)) }

        let buckets = WaveformMath.rmsBuckets(of: signal, count: 5)

        buckets.forEach { XCTAssertEqual($0, 0.70710678, accuracy: 0.005) }
    }

    func test_rmsBuckets_unevenBoundaries_everySampleLandsInExactlyOneBucket() {
        // 10 échantillons, 3 compartiments : [0,4) [4,7) [7,10) - le plafond de i*n/count.
        let signal: [Float] = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3]

        XCTAssertEqual(WaveformMath.rmsBuckets(of: signal, count: 3), [1, 2, 3])
    }

    func test_rmsBuckets_fewerSamplesThanBuckets_leavesTheEmptyOnesAtZero() {
        let buckets = WaveformMath.rmsBuckets(of: [0.5, 0.5], count: 4)

        XCTAssertEqual(buckets.count, 4)
        XCTAssertEqual(buckets.filter { $0 > 0 }.count, 2)
    }

    func test_rmsBuckets_emptyOrInvalid_isEmpty() {
        XCTAssertEqual(WaveformMath.rmsBuckets(of: [], count: 8), [])
        XCTAssertEqual(WaveformMath.rmsBuckets(of: [0.1, 0.2], count: 0), [])
    }

    // MARK: - Le flux : par blocs ou d'un coup, le même résultat

    func test_accumulator_chunkedStream_equalsOneShot() {
        let signal = (0..<10_007).map { Float(sin(Double($0) * 0.013)) * 0.8 }
        let oneShot = WaveformMath.rmsBuckets(of: signal, count: 64)

        var accumulator = WaveformAccumulator(count: 64, totalFrames: Int64(signal.count))
        stride(from: 0, to: signal.count, by: 997).forEach { start in
            accumulator.append(Array(signal[start ..< min(start + 997, signal.count)]))
        }

        zip(accumulator.result(), oneShot).forEach { XCTAssertEqual($0, $1, accuracy: 0.0001) }
    }

    func test_accumulator_framesPastTheEstimate_foldIntoTheLastBucket() {
        var accumulator = WaveformAccumulator(count: 2, totalFrames: 4)
        accumulator.append([0, 0, 1, 1, 1, 1])

        let result = accumulator.result()

        XCTAssertEqual(result[0], 0, accuracy: 0.0001)
        XCTAssertEqual(result[1], 1, accuracy: 0.0001)
    }

    func test_accumulator_nothingAppended_isEmpty() {
        XCTAssertEqual(WaveformAccumulator(count: 8, totalFrames: 100).result(), [])
        XCTAssertEqual(WaveformAccumulator(count: 8, totalFrames: 0).result(), [])
    }

    // MARK: - Mono

    func test_monoMix_averagesTheChannels() {
        XCTAssertEqual(WaveformMath.monoMix([[1, 0, 0.5], [0, 1, 0.5]]), [0.5, 0.5, 0.5])
        XCTAssertEqual(WaveformMath.monoMix([[0.3, 0.6]]), [0.3, 0.6])
        XCTAssertEqual(WaveformMath.monoMix([]), [])
    }
}
