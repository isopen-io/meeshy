import CoreGraphics
import Foundation

/// CE QUE MONTRE UNE CARTE, EN VALEURS (#18872) : son centre, son étendue en degrés et sa taille à l'écran. De quoi
/// poser une épingle (K36) ou un tracé (K54) au-dessus d'elle sans lui demander quoi que ce soit : la projection est
/// celle de Mercator, la même que la carte, sans rotation ni inclinaison (la carte les refuse).
public struct LocationMapViewport: Equatable, Sendable {
    public let centerLatitude: Double
    public let centerLongitude: Double
    public let latitudeDelta: Double
    public let longitudeDelta: Double
    public let width: Double
    public let height: Double

    public init(centerLatitude: Double, centerLongitude: Double, latitudeDelta: Double, longitudeDelta: Double,
                width: Double, height: Double) {
        self.centerLatitude = min(max(centerLatitude, -85), 85)
        self.centerLongitude = centerLongitude
        self.latitudeDelta = max(latitudeDelta, 1e-6)
        self.longitudeDelta = max(longitudeDelta, 1e-6)
        self.width = max(width, 1)
        self.height = max(height, 1)
    }

    /// Le point d'écran d'une coordonnée (hors champ compris : l'hôte décide de ce qu'il dessine).
    public func point(latitude: Double, longitude: Double) -> CGPoint {
        let worldWidth = longitudeDelta / 360
        let top = Self.mercatorY(latitude: centerLatitude + latitudeDelta / 2)
        let bottom = Self.mercatorY(latitude: centerLatitude - latitudeDelta / 2)
        let worldHeight = max(bottom - top, 1e-12)
        let x = (Self.mercatorX(longitude: longitude) - Self.mercatorX(longitude: centerLongitude)) / worldWidth
        let y = (Self.mercatorY(latitude: latitude) - Self.mercatorY(latitude: centerLatitude)) / worldHeight
        return CGPoint(x: width / 2 + x * width, y: height / 2 + y * height)
    }

    /// Combien de points d'écran couvre une distance au sol, au centre de la carte.
    public func points(forMeters meters: Double) -> Double {
        let metersAcross = longitudeDelta * 111_320 * cos(centerLatitude * .pi / 180)
        guard metersAcross > 0, meters.isFinite else { return 0 }
        return max(0, meters) / metersAcross * width
    }

    /// Une coordonnée tombe-t-elle dans la carte, à `margin` points près ?
    public func contains(latitude: Double, longitude: Double, margin: Double = 0) -> Bool {
        let p = point(latitude: latitude, longitude: longitude)
        return p.x >= -margin && p.x <= width + margin && p.y >= -margin && p.y <= height + margin
    }

    private static func mercatorX(longitude: Double) -> Double {
        (longitude + 180) / 360
    }

    private static func mercatorY(latitude: Double) -> Double {
        let clamped = min(max(latitude, -85), 85) * .pi / 180
        return (1 - log(tan(clamped) + 1 / cos(clamped)) / .pi) / 2
    }
}

/// La région à montrer pour qu'un ensemble de lieux tienne à l'écran, chacun avec son cercle de flou.
public struct LocationMapRegion: Equatable, Sendable {
    public let centerLatitude: Double
    public let centerLongitude: Double
    public let latitudeDelta: Double
    public let longitudeDelta: Double

    /// Une étendue minimale : jamais plus serré qu'une rue.
    public static let minimumSpanMeters: Double = 600

    public init(centerLatitude: Double, centerLongitude: Double, latitudeDelta: Double, longitudeDelta: Double) {
        self.centerLatitude = centerLatitude
        self.centerLongitude = centerLongitude
        self.latitudeDelta = latitudeDelta
        self.longitudeDelta = longitudeDelta
    }

    /// `nil` sans lieu. `margin` agrandit l'étendue (1,4 = 40 % d'air autour).
    public static func fitting(_ places: [(latitude: Double, longitude: Double, radiusMeters: Double)],
                               margin: Double = 1.4) -> LocationMapRegion? {
        guard !places.isEmpty else { return nil }
        let degreesPerMeter = 1 / 111_320.0
        let latitudes = places.flatMap { [$0.latitude - $0.radiusMeters * degreesPerMeter, $0.latitude + $0.radiusMeters * degreesPerMeter] }
        let middle = places.map { $0.latitude }.reduce(0, +) / Double(places.count)
        let lonScale = max(cos(middle * .pi / 180), 0.01)
        let longitudes = places.flatMap {
            [$0.longitude - $0.radiusMeters * degreesPerMeter / lonScale, $0.longitude + $0.radiusMeters * degreesPerMeter / lonScale]
        }
        guard let minLat = latitudes.min(), let maxLat = latitudes.max(),
              let minLon = longitudes.min(), let maxLon = longitudes.max() else { return nil }
        let floor = minimumSpanMeters * degreesPerMeter
        return LocationMapRegion(
            centerLatitude: (minLat + maxLat) / 2,
            centerLongitude: (minLon + maxLon) / 2,
            latitudeDelta: min(max((maxLat - minLat) * margin, floor), 170),
            longitudeDelta: min(max((maxLon - minLon) * margin, floor / lonScale), 350)
        )
    }
}
