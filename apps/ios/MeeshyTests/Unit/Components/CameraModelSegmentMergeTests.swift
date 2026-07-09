import XCTest
@testable import Meeshy

/// `CameraModel.mergeSegments` stitches the video segments produced by a
/// mid-recording camera switch (see the doc-comment on `recordedSegmentURLs`
/// in CameraView.swift) into one continuous file.
///
/// Only the empty-input fast path is exercised as real behavior here — it
/// returns before touching AVFoundation asset loading at all, so it's fast
/// and hardware-independent. An earlier version of this suite additionally
/// synthesized throwaway H.264 clips with `AVAssetWriter` to round-trip
/// through the real `AVMutableComposition`/`AVAssetExportSession` pipeline,
/// but that proved too fragile in CI (encoder/container edge cases unrelated
/// to `mergeSegments`'s own logic caused spurious "returned nil" failures,
/// and an earlier iteration of the fixture helper's frame-write loop even
/// hung the whole CI job). The rest of `mergeSegments`'s behavior is pinned
/// structurally instead — see `CameraModelSwitchDuringRecordingTests`.
final class CameraModelSegmentMergeTests: XCTestCase {

    func test_mergeSegments_emptyInput_returnsNil() async {
        let result = await CameraModel.mergeSegments([])
        XCTAssertNil(result)
    }
}
