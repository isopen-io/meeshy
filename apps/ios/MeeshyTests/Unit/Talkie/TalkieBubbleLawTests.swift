import SwiftUI
import XCTest
@testable import Meeshy

/// La bulle du talkie (#20531) : un cercle au silence, une forme qui suit chacune des 120 bandes.
final class TalkieBubbleLawTests: XCTestCase {

    private let geometry = TalkieBubbleGeometry(baseRadius: 50, maxAmplitude: 20)
    private let center = CGPoint(x: 100, y: 80)
    private let bandCount = 120

    private func distance(_ point: CGPoint) -> CGFloat {
        hypot(point.x - center.x, point.y - center.y)
    }

    private func tips(_ bands: [Float]) -> [CGPoint] {
        TalkieBubbleLaw.tips(bands: bands, geometry: geometry, center: center)
    }

    private func sampledDistances(of path: Path) -> [CGFloat] {
        var current = CGPoint.zero
        var distances: [CGFloat] = []
        path.forEach { element in
            switch element {
            case .move(let to):
                current = to
                distances.append(distance(to))
            case .line(let to):
                current = to
                distances.append(distance(to))
            case .curve(let to, let c1, let c2):
                for step in 1...20 {
                    let t = CGFloat(step) / 20, u = 1 - t
                    let x = u * u * u * current.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x
                    let y = u * u * u * current.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y
                    distances.append(distance(CGPoint(x: x, y: y)))
                }
                current = to
            default:
                break
            }
        }
        return distances
    }

    func test_tips_silence_isPerfectCircle() {
        let points = tips([Float](repeating: 0, count: bandCount))
        XCTAssertEqual(points.count, bandCount)
        points.forEach { XCTAssertEqual(distance($0), 50, accuracy: 0.001) }
    }

    func test_tips_firstBand_isAtTopOfCircle() {
        let first = tips([Float](repeating: 0, count: bandCount))[0]
        XCTAssertEqual(first.x, center.x, accuracy: 0.001)
        XCTAssertEqual(first.y, center.y - 50, accuracy: 0.001)
    }

    func test_tips_quarterBand_isOnTheRightGoingClockwise() {
        let point = tips([Float](repeating: 0, count: bandCount))[30]
        XCTAssertEqual(point.x, center.x + 50, accuracy: 0.001)
        XCTAssertEqual(point.y, center.y, accuracy: 0.001)
    }

    func test_tips_bassOnly_bulgesOnlyBassSide() {
        let bands = (0..<bandCount).map { $0 < 30 ? Float(1) : 0 }
        let points = tips(bands)
        (0..<30).forEach { XCTAssertEqual(distance(points[$0]), 70, accuracy: 0.001) }
        (60..<bandCount).forEach { XCTAssertEqual(distance(points[$0]), 50, accuracy: 0.001) }
    }

    func test_tips_neverBeyondMaxAmplitude() {
        let points = tips([Float](repeating: 1.7, count: bandCount))
        points.forEach { XCTAssertEqual(distance($0), 70, accuracy: 0.001) }
    }

    func test_tips_nonFiniteAndNegativeBands_countAsSilence() {
        var bands = [Float](repeating: 0.5, count: bandCount)
        bands[0] = .nan
        bands[1] = .infinity
        bands[2] = -.infinity
        bands[3] = -0.4
        let points = tips(bands)
        XCTAssertEqual(distance(points[0]), 50, accuracy: 0.001)
        XCTAssertEqual(distance(points[1]), 50, accuracy: 0.001)
        XCTAssertEqual(distance(points[2]), 50, accuracy: 0.001)
        XCTAssertEqual(distance(points[3]), 50, accuracy: 0.001)
        XCTAssertEqual(distance(points[4]), 60, accuracy: 0.001)
    }

    func test_tips_wrongBandCount_missingCountAsSilenceExtraIgnored() {
        let short = tips([Float](repeating: 1, count: 10))
        XCTAssertEqual(short.count, bandCount)
        XCTAssertEqual(distance(short[9]), 70, accuracy: 0.001)
        XCTAssertEqual(distance(short[10]), 50, accuracy: 0.001)
        let long = tips([Float](repeating: 1, count: 300))
        XCTAssertEqual(long.count, bandCount)
        XCTAssertEqual(tips([]).count, bandCount)
    }

    func test_outline_isClosed() {
        let points = tips((0..<bandCount).map { Float($0 % 7) / 7 })
        let path = TalkieBubbleLaw.outline(tips: points, geometry: geometry, center: center)
        var start: CGPoint?
        var end: CGPoint?
        var closes = 0
        path.forEach { element in
            switch element {
            case .move(let to): start = to
            case .curve(let to, _, _): end = to
            case .closeSubpath: closes += 1
            default: break
            }
        }
        XCTAssertEqual(start?.x ?? .nan, points[0].x, accuracy: 0.001)
        XCTAssertEqual(start?.y ?? .nan, points[0].y, accuracy: 0.001)
        XCTAssertEqual(end?.x ?? .nan, points[0].x, accuracy: 0.001)
        XCTAssertEqual(end?.y ?? .nan, points[0].y, accuracy: 0.001)
        XCTAssertEqual(closes, 1)
    }

    func test_outline_passesThroughEveryTip() {
        let points = tips((0..<bandCount).map { Float($0 % 5) / 5 })
        var ends: [CGPoint] = []
        TalkieBubbleLaw.outline(tips: points, geometry: geometry, center: center).forEach { element in
            if case .curve(let to, _, _) = element { ends.append(to) }
        }
        let expected = Array(points.dropFirst()) + [points[0]]
        XCTAssertEqual(ends.count, expected.count)
        zip(ends, expected).forEach {
            XCTAssertEqual($0.x, $1.x, accuracy: 0.001)
            XCTAssertEqual($0.y, $1.y, accuracy: 0.001)
        }
    }

    private var stepBands: [Float] {
        (0..<bandCount).map { ($0 / 2).isMultiple(of: 2) ? 0 : 1 }
    }

    func test_outline_neverBeyondMaxAmplitude() {
        let path = TalkieBubbleLaw.outline(tips: tips(stepBands), geometry: geometry, center: center)
        let distances = sampledDistances(of: path)
        XCTAssertGreaterThan(distances.count, bandCount * 20)
        XCTAssertLessThanOrEqual(distances.max() ?? .infinity, 70.5)
        XCTAssertGreaterThanOrEqual(distances.min() ?? 0, 49.5)
    }

    func test_outline_withoutClamp_overshootsAtStepEdges() {
        let path = TalkieBubbleLaw.unclampedOutlineForTesting(tips: tips(stepBands))
        let distances = sampledDistances(of: path)
        XCTAssertTrue((distances.max() ?? 0) > 70.5 || (distances.min() ?? .infinity) < 49.5)
    }

    func test_outline_silence_staysOnTheCircle() {
        let path = TalkieBubbleLaw.outline(tips: tips([Float](repeating: 0, count: bandCount)), geometry: geometry, center: center)
        sampledDistances(of: path).forEach { XCTAssertEqual($0, 50, accuracy: 0.5) }
    }

    func test_outline_tooFewTips_isEmpty() {
        XCTAssertTrue(TalkieBubbleLaw.outline(tips: [CGPoint(x: 1, y: 1), CGPoint(x: 2, y: 2)], geometry: geometry, center: center).isEmpty)
    }

    func test_reducedMotionStroke_mapsLevelFromTwoToSixPoints() {
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: 0), 2, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: 0.5), 4, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: 1), 6, accuracy: 0.0001)
    }

    func test_reducedMotionStroke_outOfRangeOrNaN_isClamped() {
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: -3), 2, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: 9), 6, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleLaw.reducedMotionStroke(level: .nan), 2, accuracy: 0.0001)
    }

    /// La réponse « voix » (2026-11-25) : une bande à −40 dBFS (0,2) atteint la moitié de l'amplitude, le silence reste
    /// un cercle, le plein reste au bord, et la courbe ne redescend jamais.
    func test_voiceResponse_bringsNormalSpeechToHalfTheRange() {
        XCTAssertEqual(TalkieBubbleResponse.voice.level(0.2), 0.5, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleResponse.voice.level(0), 0, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleResponse.voice.level(1), 1, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleResponse.voice.level(.nan), 0, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleResponse.voice.level(7), 1, accuracy: 0.0001)
        let samples = stride(from: Float(0), through: 1, by: 0.01).map { TalkieBubbleResponse.voice.level($0) }
        XCTAssertEqual(samples, samples.sorted())
    }

    func test_linearResponse_keepsTheBandAsIs() {
        XCTAssertEqual(TalkieBubbleResponse.linear.level(0.2), 0.2, accuracy: 0.0001)
        XCTAssertEqual(TalkieBubbleResponse.linear.level(-1), 0, accuracy: 0.0001)
    }

    func test_tips_voiceResponse_liftsAQuietBandToHalfItsAmplitude() {
        let lifted = TalkieBubbleGeometry(baseRadius: 50, maxAmplitude: 20, response: .voice)
        let tips = TalkieBubbleLaw.tips(bands: [0.2], geometry: lifted, center: center)
        XCTAssertEqual(distance(tips[0]), 60, accuracy: 0.001)
        XCTAssertEqual(distance(tips[1]), 50, accuracy: 0.001)
    }
}
