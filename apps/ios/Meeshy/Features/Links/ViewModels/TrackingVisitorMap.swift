import CoreLocation
import Foundation
import MeeshySDK
import MeeshyUI

/// Une zone de la carte des visiteurs, située : l'agrégat servi (#19412) et le centre que l'appareil a trouvé à sa
/// ville ou à son pays. Jamais un clic isolé : le serveur ne sert que des comptes au-dessus de son plancher.
nonisolated struct TrackingVisitorZone: Equatable, Sendable {
    let place: TrackingVisitorPlace
    let latitude: Double
    let longitude: Double
}

/// Ce que montre la section « Carte des visiteurs » : le nombre de pays de la fenêtre et les zones déjà situées.
/// Absente (`nil` dans le ViewModel), la section ne s'affiche pas : le serveur ne sert pas encore la carte.
nonisolated struct TrackingVisitorMapState: Equatable, Sendable {
    let countryCount: Int
    let zones: [TrackingVisitorZone]
    let isLocating: Bool
}

/// La géométrie de la carte des visiteurs : quelles zones situer, quelle région montrer, où poser chaque bulle K50.
nonisolated enum TrackingVisitorMapLayout {
    static let shownZones = 12
    static let windowDays = 30
    static let zoneRadiusMeters: Double = 40_000

    /// Les zones à situer : les plus fournies d'abord, au plus douze, jamais une zone vide.
    static func shown(_ places: [TrackingVisitorPlace]) -> [TrackingVisitorPlace] {
        Array(places.filter { $0.count > 0 }.sorted { $0.count > $1.count }.prefix(shownZones))
    }

    /// Le nombre de pays : celui du serveur quand il le sert, sinon celui des zones.
    static func countryCount(_ stats: TrackingLinkPlaceStats, places: [TrackingVisitorPlace]) -> Int {
        stats.countryCount ?? Set(places.map(\.country)).count
    }

    static func region(_ zones: [TrackingVisitorZone]) -> LocationMapRegion? {
        LocationMapRegion.fitting(zones.map { (latitude: $0.latitude, longitude: $0.longitude, radiusMeters: zoneRadiusMeters) },
                                  margin: 1.6)
    }

    /// Les bulles posées sur la carte : la projection de la carte donne l'abscisse et l'élévation ; une zone hors champ
    /// ne se dessine pas.
    @MainActor
    static func points(_ zones: [TrackingVisitorZone], in viewport: LocationMapViewport) -> [MeeshyChartPoint] {
        zones.filter { viewport.contains(latitude: $0.latitude, longitude: $0.longitude) }.map { zone in
            let spot = viewport.point(latitude: zone.latitude, longitude: zone.longitude)
            return MeeshyChartPoint(id: id(zone.place), value: Double(zone.place.count), label: zone.place.count.formatted(),
                                    spoken: TrackingDetailCopy.zoneClicks(name(zone.place), zone.place.count),
                                    position: Double(spot.x) / viewport.width, elevation: Double(spot.y) / viewport.height)
        }
    }

    static func id(_ place: TrackingVisitorPlace) -> String {
        "\(place.country)|\(place.city ?? "")"
    }

    /// « Dakar, Sénégal », ou le pays seul quand le plancher du serveur a replié la ville.
    @MainActor
    static func name(_ place: TrackingVisitorPlace) -> String {
        let country = TrackingLinkDetailView.countryName(place.country)
        return place.city.map { "\($0), \(country)" } ?? country
    }
}

/// Le centre d'une zone, trouvé sur l'appareil par le géocodeur du système. Les centres se gardent le temps de la
/// session : une ville ne se redemande pas d'un lien à l'autre.
@MainActor
enum TrackingPlaceGeocoder {
    private static var known: [String: CLLocationCoordinate2D] = [:]

    static func locate(_ place: TrackingVisitorPlace) async -> TrackingVisitorZone? {
        let key = TrackingVisitorMapLayout.id(place)
        if let center = known[key] {
            return TrackingVisitorZone(place: place, latitude: center.latitude, longitude: center.longitude)
        }
        let country = Locale(identifier: "en_US").localizedString(forRegionCode: place.country) ?? place.country
        let query = [place.city, country].compactMap { $0 }.joined(separator: ", ")
        guard let center = try? await CLGeocoder().geocodeAddressString(query).first?.location?.coordinate else { return nil }
        known[key] = center
        return TrackingVisitorZone(place: place, latitude: center.latitude, longitude: center.longitude)
    }
}
