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

    func resolve(_ pins: [SharedLocationPin]) async {
        for pin in pins {
            let key = Self.key(pin)
            guard !asked.contains(key) else { continue }
            asked.insert(key)
            let location = CLLocation(latitude: pin.latitude, longitude: pin.longitude)
            guard let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first else { continue }
            guard let name = Self.name(of: placemark, precision: pin.precision) else { continue }
            names[key] = name
            Self.known[key] = name
        }
    }

    private static func key(_ pin: SharedLocationPin) -> String {
        "\(pin.precision.rawValue):\((pin.latitude * 1_000).rounded()):\((pin.longitude * 1_000).rounded())"
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
