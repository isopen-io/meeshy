import Foundation
import CoreLocation

/// Représentation unique d'un lieu partagé, du picker jusqu'au serveur et
/// retour. Un seul type pour les quatre surfaces (message, commentaire, post,
/// story) : les rendus divergeaient auparavant parce que chacune reconstruisait
/// sa propre notion de « position ».
public struct SharedPlace: Codable, Equatable, Sendable {
    public let latitude: Double
    public let longitude: Double
    /// Nom du POI ou du lieu. `nil` pour un point posé à la main dont le
    /// géocodage inverse n'a rien rendu.
    public let name: String?
    public let address: String?
    /// Catégorie MapKit du POI (`MKPointOfInterestCategory.rawValue`).
    public let category: String?

    public init(latitude: Double, longitude: Double,
                name: String? = nil, address: String? = nil, category: String? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.name = name
        self.address = address
        self.category = category
    }

    public var clLocationCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
