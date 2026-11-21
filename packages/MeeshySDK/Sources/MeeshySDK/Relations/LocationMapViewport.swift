import CoreGraphics
import Foundation

/// CE QUE MONTRE UNE CARTE, EN VALEURS (#18872) : son centre, son étendue en degrés et sa taille à l'écran. De quoi
/// poser une épingle (K36) ou un tracé (K54) au-dessus d'elle sans lui demander quoi que ce soit : la projection est
/// celle de Mercator, la même que la carte, sans inclinaison. Une carte qui tourne (#19622) porte son CAP : les étendues
/// restent celles de la carte remise au nord, et chaque point tourne autour du centre de l'écran.
public struct LocationMapViewport: Equatable, Sendable {
    public let centerLatitude: Double
    public let centerLongitude: Double
    public let latitudeDelta: Double
    public let longitudeDelta: Double
    public let width: Double
    public let height: Double
    /// Le cap de la carte en degrés, dans [0, 360) : la direction que montre le haut de l'écran (0 = le nord).
    public let heading: Double

    /// La carte est au nord à un demi-degré près : la boussole n'a rien à remettre.
    public static let northUpTolerance: Double = 0.5

    public init(centerLatitude: Double, centerLongitude: Double, latitudeDelta: Double, longitudeDelta: Double,
                width: Double, height: Double, heading: Double = 0) {
        self.centerLatitude = min(max(centerLatitude, -85), 85)
        self.centerLongitude = centerLongitude
        self.latitudeDelta = max(latitudeDelta, 1e-6)
        self.longitudeDelta = max(longitudeDelta, 1e-6)
        self.width = max(width, 1)
        self.height = max(height, 1)
        self.heading = Self.normalized(heading)
    }

    /// La carte montre-t-elle le nord en haut ?
    public var isNorthUp: Bool {
        min(heading, 360 - heading) < Self.northUpTolerance
    }

    /// L'angle de l'aiguille d'une boussole posée sur la carte : à l'inverse du cap, elle montre le nord.
    public var compassNeedleDegrees: Double {
        -heading
    }

    /// L'étendue en longitude qui couvre les quatre coins de l'écran, la carte tournée comprise.
    public var visibleLongitudeDelta: Double {
        let (cosine, sine) = Self.turn(heading)
        return longitudeDelta * (width * abs(cosine) + height * abs(sine)) / width
    }

    /// L'étendue en latitude qui couvre les quatre coins de l'écran, la carte tournée comprise.
    public var visibleLatitudeDelta: Double {
        let (cosine, sine) = Self.turn(heading)
        return latitudeDelta * (width * abs(sine) + height * abs(cosine)) / height
    }

    /// Lit une carte tournée depuis ce qu'elle montre : son centre, la coordonnée du milieu de son bord DROIT et son
    /// cap. L'échelle de Mercator est la même dans toutes les directions : la demi-largeur suffit à la poser.
    public static func reading(centerLatitude: Double, centerLongitude: Double, edgeLatitude: Double,
                               edgeLongitude: Double, width: Double, height: Double,
                               heading: Double) -> LocationMapViewport {
        let longitudeStep = (edgeLongitude - centerLongitude).remainder(dividingBy: 360)
        let latitudeStep = mercatorY(latitude: edgeLatitude) - mercatorY(latitude: centerLatitude)
        let halfWidth = max(hypot(longitudeStep / 360, latitudeStep), 1e-12)
        let halfHeight = halfWidth * max(height, 1) / max(width, 1)
        let middle = mercatorY(latitude: centerLatitude)
        let top = latitude(mercatorY: middle - halfHeight)
        let bottom = latitude(mercatorY: middle + halfHeight)
        return LocationMapViewport(centerLatitude: centerLatitude, centerLongitude: centerLongitude,
                                   latitudeDelta: top - bottom, longitudeDelta: halfWidth * 2 * 360,
                                   width: width, height: height, heading: heading)
    }

    /// Le point d'écran d'une coordonnée (hors champ compris : l'hôte décide de ce qu'il dessine).
    public func point(latitude: Double, longitude: Double) -> CGPoint {
        let worldWidth = longitudeDelta / 360
        let top = Self.mercatorY(latitude: centerLatitude + latitudeDelta / 2)
        let bottom = Self.mercatorY(latitude: centerLatitude - latitudeDelta / 2)
        let worldHeight = max(bottom - top, 1e-12)
        let x = (Self.mercatorX(longitude: longitude) - Self.mercatorX(longitude: centerLongitude)) / worldWidth
        let y = (Self.mercatorY(latitude: latitude) - Self.mercatorY(latitude: centerLatitude)) / worldHeight
        let (cosine, sine) = Self.turn(heading)
        let dx = x * width
        let dy = y * height
        return CGPoint(x: width / 2 + dx * cosine + dy * sine, y: height / 2 - dx * sine + dy * cosine)
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

    private static func normalized(_ heading: Double) -> Double {
        guard heading.isFinite else { return 0 }
        let turned = heading.truncatingRemainder(dividingBy: 360)
        return turned < 0 ? turned + 360 : turned
    }

    private static func turn(_ heading: Double) -> (cosine: Double, sine: Double) {
        let radians = heading * .pi / 180
        return (cos(radians), sin(radians))
    }

    private static func latitude(mercatorY y: Double) -> Double {
        atan(sinh(.pi * (1 - 2 * y))) * 180 / .pi
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
