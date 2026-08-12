import XCTest
import SwiftUI
import MapKit
import CoreLocation
@testable import MeeshySDK
@testable import MeeshyUI

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

    // MARK: - AdaptiveMapInitialRegion (gel du picker de lieu, 2026-07-30)

    /// Pins the pure decision extracted from `ModernInteractiveMap.init` /
    /// `LegacyInteractiveMap.init` — which region an adaptive map opens on
    /// when `target` is absent. MUST stay a fixed, explicit region:
    /// reverting to `.userLocation(fallback: .automatic)` on iOS 17 resolves
    /// SYNCHRONOUSLY on the main thread inside `updateUIView` and, paired
    /// with `.onMapCameraChange` writing back into the same `@State`,
    /// re-enters itself — the proven cause of the location-picker
    /// main-thread freeze (process sampling showed two nested
    /// `-[MKMapView _performActionAsIfGoingToDefaultLocation:]` frames on
    /// the same stack).
    func test_adaptiveMapInitialRegion_resolve_nilTarget_returnsTheNeutralRegion() {
        let region = AdaptiveMapInitialRegion.resolve(for: nil)
        XCTAssertEqual(region.center.latitude, AdaptiveMapInitialRegion.neutral.center.latitude, accuracy: 0.0001)
        XCTAssertEqual(region.center.longitude, AdaptiveMapInitialRegion.neutral.center.longitude, accuracy: 0.0001)
        XCTAssertEqual(region.span.latitudeDelta, AdaptiveMapInitialRegion.neutral.span.latitudeDelta, accuracy: 0.0001)
        XCTAssertEqual(region.span.longitudeDelta, AdaptiveMapInitialRegion.neutral.span.longitudeDelta, accuracy: 0.0001)
    }

    func test_adaptiveMapInitialRegion_resolve_withTarget_usesTheTargetsRegionVerbatim() {
        let target = MapTarget(
            center: CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522),
            latitudinalMeters: 500,
            longitudinalMeters: 500
        )
        let region = AdaptiveMapInitialRegion.resolve(for: target)
        XCTAssertEqual(region.center.latitude, 48.8566, accuracy: 0.0001)
        XCTAssertEqual(region.center.longitude, 2.3522, accuracy: 0.0001)
    }

    func test_adaptiveMapInitialRegion_neutral_isFarFromAnyRealisticUserFix() {
        // A loose sanity check that the neutral region is a deliberate,
        // wide "world view" rather than something that could be mistaken
        // for a resolved location fix.
        XCTAssertGreaterThan(AdaptiveMapInitialRegion.neutral.span.latitudeDelta, 60)
        XCTAssertGreaterThan(AdaptiveMapInitialRegion.neutral.span.longitudeDelta, 60)
    }

    // MARK: - CoordinateEquivalence (idempotence updateSelectedLocation, 2026-07-30)

    /// `LocationPickerModel.updateSelectedLocation` (app-side) republished the
    /// SAME coordinate on every camera callback, tirant `objectWillChange`
    /// without writing a new value — the second, necessary ingredient of the
    /// location-picker freeze alongside `AdaptiveMapInitialRegion`. This
    /// predicate is the pure rule the app-side guard is built on.
    func test_coordinateEquivalence_identicalCoordinates_areApproximatelyEqual() {
        let a = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let b = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        XCTAssertTrue(CoordinateEquivalence.isApproximatelyEqual(a, b))
    }

    func test_coordinateEquivalence_floatingPointDrift_isTreatedAsTheSamePoint() {
        let a = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let drifted = CLLocationCoordinate2D(latitude: 48.8566 + 5e-8, longitude: 2.3522 - 5e-8)
        XCTAssertTrue(CoordinateEquivalence.isApproximatelyEqual(a, drifted),
                      "MapKit's ~1e-9° camera-callback drift must not be treated as a real move.")
    }

    func test_coordinateEquivalence_genuinelyDifferentCoordinates_areNotEqual() {
        let paris = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let newYork = CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060)
        XCTAssertFalse(CoordinateEquivalence.isApproximatelyEqual(paris, newYork))
    }

    func test_coordinateEquivalence_justOutsideTolerance_isNotEqual() {
        let a = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let justOutside = CLLocationCoordinate2D(latitude: 48.8566 + 2e-7, longitude: 2.3522)
        XCTAssertFalse(CoordinateEquivalence.isApproximatelyEqual(a, justOutside),
                       "A move of ~2cm is a real pan, not drift — the guard must not swallow it.")
    }

    // MARK: - PinItem stability

    func test_pinItem_identityIsDerivedFromCoordinate_notRandom() {
        let coord = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let a = PinItem(coordinate: coord)
        let b = PinItem(coordinate: coord)
        XCTAssertEqual(a.id, b.id,
                       "Deux pins sur le même point doivent partager leur identité : une identité aléatoire fait recréer l'annotation à chaque rendu.")

        let elsewhere = PinItem(coordinate: CLLocationCoordinate2D(latitude: 45.75, longitude: 4.85))
        XCTAssertNotEqual(a.id, elsewhere.id, "Deux points distincts doivent rester distinguables.")
    }
}

/// `AdaptiveInteractiveMap` doit pouvoir se construire SANS les contrôles
/// système et dans un style donné. Le picker de lieu en dépend : le
/// `MapUserLocationButton` de `mapControls` se rend en haut-trailing, sous la
/// barre de recherche flottante, où il est inatteignable.
@MainActor
final class AdaptiveInteractiveMapStyleTests: XCTestCase {

    func test_init_acceptePasDeControlesEtUnStyle() {
        let map = AdaptiveInteractiveMap(
            target: nil,
            annotationCoordinate: nil,
            style: .hybrid,
            defaultControls: false,
            onRegionChange: { _ in }
        ) { EmptyView() }

        XCTAssertNotNil(map.body)
    }

    func test_init_conserveSesDefautsPourLesAppelantsExistants() {
        // Signature historique, sans `style:` ni `defaultControls:` — les
        // autres appelants du SDK et de l'app doivent continuer à compiler.
        let map = AdaptiveInteractiveMap(
            target: nil,
            annotationCoordinate: nil,
            onRegionChange: { _ in }
        ) { EmptyView() }

        XCTAssertNotNil(map.body)
    }
}
