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
}
