import CoreGraphics
import Foundation
import Testing
@testable import MeeshySDK

/// LA PROJECTION DE LA CARTE (#18872) : l'épingle et le tracé se posent au-dessus de la carte, à l'endroit où la carte
/// montre la coordonnée servie — ni ailleurs, ni plus fin.
struct LocationMapViewportTests {

    private let lisbon = LocationMapViewport(centerLatitude: 38.7139, centerLongitude: -9.1334,
                                             latitudeDelta: 0.04, longitudeDelta: 0.05, width: 390, height: 844)

    @Test("le centre de la carte tombe au centre de l'écran")
    func center_isTheMiddleOfTheScreen() {
        let p = lisbon.point(latitude: 38.7139, longitude: -9.1334)
        #expect(abs(p.x - 195) < 0.001)
        #expect(abs(p.y - 422) < 0.001)
    }

    @Test("le nord est en haut, l'est à droite, et les bords de l'étendue aux bords de l'écran")
    func orientation_andEdges() {
        let north = lisbon.point(latitude: 38.7339, longitude: -9.1334)
        let east = lisbon.point(latitude: 38.7139, longitude: -9.1084)
        #expect(north.y < 422)
        #expect(abs(north.y) < 1)
        #expect(abs(east.x - 390) < 0.001)
        #expect(lisbon.contains(latitude: 38.72, longitude: -9.13))
        #expect(!lisbon.contains(latitude: 38.80, longitude: -9.13))
    }

    @Test("un rayon au sol devient une longueur d'écran à l'échelle de la carte")
    func meters_toPoints() {
        let across = 0.05 * 111_320 * cos(38.7139 * Double.pi / 180)
        #expect(abs(lisbon.points(forMeters: across / 2) - 195) < 0.001)
        #expect(lisbon.points(forMeters: -5) == 0)
    }

    @Test("la région englobe chaque lieu et son flou, avec de l'air, jamais plus serrée qu'une rue")
    func region_fitsEveryPlace() throws {
        let region = try #require(LocationMapRegion.fitting([
            (latitude: 38.7139, longitude: -9.1334, radiusMeters: 1_200),
            (latitude: 38.7000, longitude: -9.1500, radiusMeters: 10),
        ]))
        #expect(region.centerLatitude < 38.7139 && region.centerLatitude > 38.70)
        let rawSpan = (38.7139 + 1_200 / 111_320.0) - (38.7000 - 10 / 111_320.0)
        #expect(region.latitudeDelta > rawSpan)
        let single = try #require(LocationMapRegion.fitting([(latitude: 0, longitude: 0, radiusMeters: 0)]))
        #expect(single.latitudeDelta >= LocationMapRegion.minimumSpanMeters / 111_320.0)
        #expect(LocationMapRegion.fitting([]) == nil)
    }

    // MARK: - Le cap (#19622)

    @Test("une carte tournée vers l'est montre le nord à gauche et l'est en haut")
    func heading_rotatesTheProjectionWithTheMap() {
        let turned = LocationMapViewport(centerLatitude: 38.7139, centerLongitude: -9.1334, latitudeDelta: 0.04,
                                         longitudeDelta: 0.05, width: 390, height: 844, heading: 90)
        let flatNorth = lisbon.point(latitude: 38.7339, longitude: -9.1334)
        let north = turned.point(latitude: 38.7339, longitude: -9.1334)
        let east = turned.point(latitude: 38.7139, longitude: -9.1084)
        let center = turned.point(latitude: 38.7139, longitude: -9.1334)

        #expect(abs(north.x - (195 - (422 - flatNorth.y))) < 0.001)
        #expect(abs(north.y - 422) < 0.001)
        #expect(abs(east.x - 195) < 0.001)
        #expect(abs(east.y - (422 - 195)) < 0.001)
        #expect(abs(center.x - 195) < 0.001 && abs(center.y - 422) < 0.001)
    }

    @Test("le cap se ramène à un tour, et la carte est au nord à un demi-degré près")
    func heading_normalizes_andSaysWhenTheMapIsNorthUp() {
        func viewport(_ heading: Double) -> LocationMapViewport {
            LocationMapViewport(centerLatitude: 0, centerLongitude: 0, latitudeDelta: 1, longitudeDelta: 1,
                                width: 100, height: 100, heading: heading)
        }
        #expect(viewport(-90).heading == 270)
        #expect(viewport(720).heading == 0)
        #expect(lisbon.heading == 0)
        #expect(lisbon.isNorthUp)
        #expect(viewport(0.3).isNorthUp)
        #expect(viewport(359.8).isNorthUp)
        #expect(!viewport(12).isNorthUp)
        #expect(!viewport(180).isNorthUp)
    }

    @Test("l'aiguille de la boussole tourne à l'inverse de la carte, pour montrer le nord")
    func compassNeedle_pointsNorth() {
        let turned = LocationMapViewport(centerLatitude: 0, centerLongitude: 0, latitudeDelta: 1, longitudeDelta: 1,
                                         width: 100, height: 100, heading: 30)
        #expect(turned.compassNeedleDegrees == -30)
        #expect(lisbon.compassNeedleDegrees == 0)
    }

    @Test("une carte tournée se lit depuis son centre et le milieu de son bord droit")
    func reading_aTurnedMap_putsTheEdgeOnTheRightEdge() {
        let flat = LocationMapViewport.reading(centerLatitude: 38.7139, centerLongitude: -9.1334,
                                               edgeLatitude: 38.7139, edgeLongitude: -9.1084,
                                               width: 390, height: 844, heading: 0)
        #expect(abs(flat.longitudeDelta - 0.05) < 1e-9)
        let flatEdge = flat.point(latitude: 38.7139, longitude: -9.1084)
        #expect(abs(flatEdge.x - 390) < 0.01 && abs(flatEdge.y - 422) < 0.01)
        let flatTop = flat.point(latitude: 38.7139 + flat.latitudeDelta / 2, longitude: -9.1334)
        #expect(abs(flatTop.y) < 0.5)

        let turned = LocationMapViewport.reading(centerLatitude: 38.7139, centerLongitude: -9.1334,
                                                 edgeLatitude: 38.69, edgeLongitude: -9.1334,
                                                 width: 390, height: 844, heading: 90)
        let edge = turned.point(latitude: 38.69, longitude: -9.1334)
        #expect(abs(edge.x - 390) < 0.5)
        #expect(abs(edge.y - 422) < 0.5)
    }

    @Test("l'étendue visible d'une carte tournée couvre ses quatre coins")
    func visibleSpan_coversTheCornersOfATurnedMap() {
        #expect(lisbon.visibleLatitudeDelta == lisbon.latitudeDelta)
        #expect(lisbon.visibleLongitudeDelta == lisbon.longitudeDelta)
        let turned = LocationMapViewport(centerLatitude: 0, centerLongitude: 0, latitudeDelta: 1, longitudeDelta: 2,
                                         width: 200, height: 400, heading: 90)
        #expect(abs(turned.visibleLongitudeDelta - 4) < 1e-9)
        #expect(abs(turned.visibleLatitudeDelta - 0.5) < 1e-9)
    }
}
