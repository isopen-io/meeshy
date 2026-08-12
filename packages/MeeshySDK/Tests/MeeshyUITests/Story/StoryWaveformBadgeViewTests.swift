import XCTest
@testable import MeeshyUI

final class StoryWaveformBadgeViewTests: XCTestCase {

    func test_downsample_reducesToBucketCount_keepingPeaks() {
        let samples: [Float] = (0..<80).map { $0 == 41 ? 1.0 : 0.1 }

        let bars = StoryWaveformBadgeView.downsample(samples, to: 20)

        XCTAssertEqual(bars.count, 20)
        XCTAssertEqual(bars[10], 1.0, accuracy: 0.001,
                       "le max par bucket préserve le pic que la moyenne écraserait")
        XCTAssertEqual(bars[0], 0.1, accuracy: 0.001)
    }

    func test_downsample_fewerSamplesThanBuckets_returnsUnchanged() {
        let samples: [Float] = [0.2, 0.6]
        XCTAssertEqual(StoryWaveformBadgeView.downsample(samples, to: 20), samples)
    }

    func test_downsample_empty_returnsEmpty() {
        XCTAssertEqual(StoryWaveformBadgeView.downsample([], to: 20), [])
    }
}
