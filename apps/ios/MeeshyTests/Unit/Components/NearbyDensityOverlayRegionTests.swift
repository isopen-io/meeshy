import MapKit
import XCTest
@testable import Meeshy
import MeeshySDK

/// La caméra de la carte « À proximité » (#3741, cause A.2 du plan
/// `docs/superpowers/plans/2026-08-25-proximite-maturation.md`) : la carte
/// naît SANS taille, et `regionThatFits` sur une vue sans taille rend une
/// région invalide que `setRegion` refuse en levant une exception — l'app se
/// fermait en touchant « À proximité ».
@MainActor
final class NearbyDensityOverlayRegionTests: XCTestCase {

    private func view(center: CLLocationCoordinate2D?, radiusKm: Double = 25) -> NearbyDiscoveryMapView {
        NearbyDiscoveryMapView(
            mode: .density,
            showsPins: false,
            pins: [],
            cells: [],
            cellSize: .city,
            hottestCellCount: 0,
            center: center,
            radiusKm: radiusKm,
            onSelectPost: { _ in },
            onSelectCell: { _ in },
            onRecenter: { _ in }
        )
    }

    private func laidOut(_ map: MKMapView) -> MKMapView {
        map.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        map.layoutIfNeeded()
        return map
    }

    private func assertFinite(_ region: MKCoordinateRegion, file: StaticString = #filePath, line: UInt = #line) {
        for value in [region.center.latitude, region.center.longitude, region.span.latitudeDelta, region.span.longitudeDelta] {
            XCTAssertTrue(value.isFinite, "composante non finie : \(region)", file: file, line: line)
        }
    }

    func test_apply_onAZeroSizedMap_posesNoRegion() {
        let map = MKMapView(frame: .zero)
        let before = map.region
        let coordinator = NearbyMapCoordinator()

        coordinator.apply(view(center: nil), to: map, animated: false)

        assertFinite(map.region)
        XCTAssertEqual(map.region.center.latitude, before.center.latitude, accuracy: 0.0001)
        XCTAssertEqual(map.region.center.longitude, before.center.longitude, accuracy: 0.0001)
    }

    func test_apply_onALaidOutMap_posesARepresentableWorldFallback_whenNoCenter() {
        let map = laidOut(MKMapView())
        let coordinator = NearbyMapCoordinator()

        coordinator.apply(view(center: nil), to: map, animated: false)

        assertFinite(map.region)
        XCTAssertEqual(map.region.center.latitude, 20, accuracy: 1)
        XCTAssertEqual(map.region.center.longitude, 0, accuracy: 1)
        XCTAssertLessThanOrEqual(map.region.center.latitude + map.region.span.latitudeDelta / 2, 90)
        XCTAssertGreaterThanOrEqual(map.region.center.latitude - map.region.span.latitudeDelta / 2, -90)
    }

    func test_apply_afterAZeroSizedCall_isReplayedOnceTheMapHasSize() {
        let map = MKMapView(frame: .zero)
        let coordinator = NearbyMapCoordinator()
        let paris = CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35)

        coordinator.apply(view(center: paris), to: map, animated: false)
        _ = laidOut(map)
        coordinator.apply(view(center: paris), to: map, animated: false)

        XCTAssertEqual(map.region.center.latitude, 48.85, accuracy: 0.05)
        XCTAssertEqual(map.region.center.longitude, 2.35, accuracy: 0.05)
    }

    func test_aPendingRegion_isPosedByTheFirstLayout_withoutAnotherUpdate() {
        let map = NearbyMapCanvas(frame: .zero)
        let coordinator = NearbyMapCoordinator()
        coordinator.map = map
        map.onLaidOut = { [weak coordinator, weak map] in
            guard let coordinator, let map else { return }
            coordinator.replayPendingRegion(on: map)
        }
        let paris = CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35)

        coordinator.apply(view(center: paris), to: map, animated: false)
        _ = laidOut(map)

        XCTAssertEqual(map.region.center.latitude, 48.85, accuracy: 0.05)
    }

    func test_aRealCenter_isNotWidenedToTheWorld() {
        let map = laidOut(MKMapView())
        let coordinator = NearbyMapCoordinator()

        coordinator.apply(view(center: CLLocationCoordinate2D(latitude: 48.85, longitude: 2.35)), to: map, animated: false)

        XCTAssertLessThan(map.region.span.latitudeDelta, 2)
    }

    /// Garde NÉGATIVE : elle rougit si la caméra revient dans `makeUIView`, où
    /// la carte n'a jamais de taille.
    func test_makeUIView_neverPosesTheCamera() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/NearbyDensityOverlay.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: "func makeUIView("))
        let end = try XCTUnwrap(source.range(of: "func updateUIView(", range: start.upperBound..<source.endIndex))
        let body = source[start.upperBound..<end.lowerBound]
        for forbidden in ["setRegion", "regionThatFits", "applyRegion", ".apply("] {
            XCTAssertFalse(body.contains(forbidden), "makeUIView pose la caméra (« \(forbidden) ») sur une carte sans taille")
        }
        XCTAssertTrue(source.contains("hasSize"), "la garde de taille a disparu")
    }
}
