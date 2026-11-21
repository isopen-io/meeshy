import CoreLocation
import Foundation
import MeeshySDK

/// LE NOM D'UN LIEU SERVI (#18872) : « Alfama, Lisbonne ». Il ne nomme que la position TELLE QUE SERVIE — déjà floutée
/// à la précision que l'émetteur a choisie —, jamais plus fin qu'elle : une position « ville » ne reçoit que sa ville.
/// Les noms se gardent en mémoire le temps de la session, à la maille de la position servie.
@MainActor
final class LocationPlaceNamer: ObservableObject {
    /// Les noms déjà trouvés, pour tous les écrans de la session : un lieu ne se redemande pas d'un écran à l'autre.
    private static var known: [String: String] = [:]

    @Published private(set) var names: [String: String] = LocationPlaceNamer.known
    private var asked = Set<String>(LocationPlaceNamer.known.keys)

    nonisolated deinit {}

    func name(for pin: SharedLocationPin) -> String? {
        names[Self.key(pin)]
    }

    /// La ville de MA position (#19560), à la seule maille de la ville : elle ne sert qu'à la pilule « De passage à »
    /// et ne quitte pas l'appareil.
    func city(of fix: SharedLocationFix) -> String? {
        names[Self.key(precision: .city, latitude: fix.latitude, longitude: fix.longitude)]
    }

    func resolve(_ pins: [SharedLocationPin]) async {
        for pin in pins {
            await resolve(precision: pin.precision, latitude: pin.latitude, longitude: pin.longitude)
        }
    }

    func resolveCity(of fix: SharedLocationFix) async {
        await resolve(precision: .city, latitude: fix.latitude, longitude: fix.longitude)
    }

    private func resolve(precision: SharedLocationPrecision, latitude: Double, longitude: Double) async {
        let key = Self.key(precision: precision, latitude: latitude, longitude: longitude)
        guard !asked.contains(key) else { return }
        asked.insert(key)
        let location = CLLocation(latitude: latitude, longitude: longitude)
        guard let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first else { return }
        guard let name = Self.name(of: placemark, precision: precision) else { return }
        names[key] = name
        Self.known[key] = name
    }

    private static func key(_ pin: SharedLocationPin) -> String {
        key(precision: pin.precision, latitude: pin.latitude, longitude: pin.longitude)
    }

    private static func key(precision: SharedLocationPrecision, latitude: Double, longitude: Double) -> String {
        "\(precision.rawValue):\((latitude * 1_000).rounded()):\((longitude * 1_000).rounded())"
    }

    /// Le quartier n'est dit que si la précision servie le montre déjà.
    private static func name(of placemark: CLPlacemark, precision: SharedLocationPrecision) -> String? {
        let parts: [String?] = precision == .city
            ? [placemark.locality ?? placemark.administrativeArea]
            : [placemark.subLocality, placemark.locality]
        let named = parts.compactMap { $0 }.filter { !$0.isEmpty }
        return named.isEmpty ? nil : named.joined(separator: ", ")
    }
}
