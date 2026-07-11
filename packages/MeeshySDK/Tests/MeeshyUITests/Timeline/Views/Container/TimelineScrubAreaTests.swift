import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Layout contract of the shared scrub surface: the ruler, every lane and
/// the playhead must share the same time→x mapping. These constants are what
/// keeps ticks aligned with clips — regressing them silently desynchronises
/// the ruler from the lanes (the exact bug the component was built to fix).
final class TimelineScrubAreaTests: XCTestCase {

    func test_laneWidth_shortDuration_clampsToMinimum() {
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let width = TimelineScrubArea<EmptyView>.laneWidth(
            totalDuration: 2, geometry: geometry, minLaneWidth: 200)
        XCTAssertEqual(width, 200,
                       "A 2s slide at 50px/s is 100px — lanes must clamp to the minimum usable width")
    }

    func test_laneWidth_longDuration_tracksGeometryWidth() {
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let width = TimelineScrubArea<EmptyView>.laneWidth(
            totalDuration: 10, geometry: geometry, minLaneWidth: 200)
        XCTAssertEqual(width, geometry.width(for: 10),
                       "Above the minimum, lane width must follow the geometry so clips and ruler agree")
    }

    func test_pinchZoom_scalesFromGestureAnchor_andClampsToRange() {
        XCTAssertEqual(TimelineScrubArea<EmptyView>.pinchZoom(anchor: 1.0, magnification: 2.0), 2.0)
        XCTAssertEqual(TimelineScrubArea<EmptyView>.pinchZoom(anchor: 2.0, magnification: 4.0), 4.0,
                       "Clamp haut à ×4 — même borne que les boutons du transport")
        XCTAssertEqual(TimelineScrubArea<EmptyView>.pinchZoom(anchor: 1.0, magnification: 0.1), 0.25,
                       "Clamp bas à ×0.25")
    }

    func test_playheadLeadingInset_isLabelColumnPlusContentPadding() {
        XCTAssertEqual(
            TimelineScrubArea<EmptyView>.playheadLeadingInset,
            TimelineScrubArea<EmptyView>.laneLabelWidth
                + TimelineScrubArea<EmptyView>.horizontalPadding,
            "Playhead x=0 must land on the lane origin: sticky label column + content padding")
    }
}
