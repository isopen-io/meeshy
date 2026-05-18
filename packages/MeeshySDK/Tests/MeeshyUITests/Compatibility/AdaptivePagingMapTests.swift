import XCTest
import SwiftUI
import MapKit
import CoreLocation
import MeeshyUI

/// Tests for the Session 4 `Compatibility/` wrappers (paging + MapKit).
///
/// `MapTarget` is a plain value type and is fully tested. The adaptive view
/// wrappers are version-conditional view code — the cases below are
/// construction smoke tests that fail the build if a public API surface drifts.
@MainActor
final class AdaptivePagingMapTests: XCTestCase {

    // MARK: - MapTarget

    func test_mapTarget_equality_sameValuesAreEqual() {
        let a = MapTarget(
            center: CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35),
            latitudinalMeters: 500,
            longitudinalMeters: 500
        )
        let b = MapTarget(
            center: CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35),
            latitudinalMeters: 500,
            longitudinalMeters: 500
        )
        XCTAssertEqual(a, b)
    }

    func test_mapTarget_equality_differentCenterIsNotEqual() {
        let a = MapTarget(center: CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35))
        let b = MapTarget(center: CLLocationCoordinate2D(latitude: 40.71, longitude: -74.0))
        XCTAssertNotEqual(a, b)
    }

    func test_mapTarget_equality_differentSpanIsNotEqual() {
        let center = CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35)
        let a = MapTarget(center: center, latitudinalMeters: 500, longitudinalMeters: 500)
        let b = MapTarget(center: center, latitudinalMeters: 1000, longitudinalMeters: 1000)
        XCTAssertNotEqual(a, b)
    }

    func test_mapTarget_region_carriesCenterAndPositiveSpan() {
        let target = MapTarget(
            center: CLLocationCoordinate2D(latitude: 1.5, longitude: 2.5),
            latitudinalMeters: 800,
            longitudinalMeters: 900
        )
        let region = target.region
        XCTAssertEqual(region.center.latitude, 1.5, accuracy: 0.0001)
        XCTAssertEqual(region.center.longitude, 2.5, accuracy: 0.0001)
        XCTAssertGreaterThan(region.span.latitudeDelta, 0)
        XCTAssertGreaterThan(region.span.longitudeDelta, 0)
    }

    // MARK: - Adaptive wrapper API surface

    private struct SamplePage: Identifiable {
        let id: String
    }

    func test_adaptiveHorizontalPager_buildsForFullscreenAndCarousel() {
        let items = [SamplePage(id: "a"), SamplePage(id: "b")]
        _ = AdaptiveHorizontalPager(
            items: items,
            currentPageID: .constant("a"),
            fillVertical: true
        ) { _, item in
            Text(item.id)
        }
        _ = AdaptiveHorizontalPager(
            items: items,
            currentPageID: .constant(nil),
            fillVertical: false,
            carouselTransition: true
        ) { index, _ in
            Text("\(index)")
        }
    }

    func test_adaptiveInteractiveMap_buildsWithAndWithoutTarget() {
        _ = AdaptiveInteractiveMap(
            target: nil,
            annotationCoordinate: nil,
            onRegionChange: { _ in }
        ) {
            Image(systemName: "mappin")
        }
        _ = AdaptiveInteractiveMap(
            target: MapTarget(center: CLLocationCoordinate2D(latitude: 0, longitude: 0)),
            annotationCoordinate: CLLocationCoordinate2D(latitude: 1, longitude: 1),
            onRegionChange: { _ in }
        ) {
            Image(systemName: "mappin")
        }
    }

    func test_adaptiveCarouselScrollTransition_appliesToAnyView() {
        _ = Text("x").adaptiveCarouselScrollTransition()
        _ = Text("x").adaptiveCarouselScrollTransition(enabled: false)
    }
}
