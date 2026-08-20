import Foundation
import CoreLocation

/// Représentation unique d'un lieu partagé, du picker jusqu'au serveur et
/// retour. Un seul type pour les quatre surfaces (message, commentaire, post,
/// story) : les rendus divergeaient auparavant parce que chacune reconstruisait
/// sa propre notion de « position ».
/// `Hashable` (synthèse : les cinq champs stockés le sont déjà) pour que les
/// types VALEUR qui transportent un lieu puissent l'être aussi —
/// `ConversationUpdatedStoreEvent` en tête, dont le `Hashable` synthétisé
/// serait sinon impossible dès qu'il porte l'épingle du dernier message.
/// À ne pas confondre avec le hash MANUEL de `MeeshyConversation`, qui ne
/// combine volontairement que `name` : c'est un hash de DIFFING SwiftUI,
/// délibérément partiel, pas l'absence de conformance ici.
public struct SharedPlace: Codable, Equatable, Hashable, Sendable {
    public let latitude: Double
    public let longitude: Double
    /// Nom du POI ou du lieu. `nil` pour un point posé à la main dont le
    /// géocodage inverse n'a rien rendu.
    public let name: String?
    public let address: String?
    /// Catégorie MapKit du POI (`MKPointOfInterestCategory.rawValue`).
    public let category: String?
    /// Identifiant du lieu quand la source en fournit un (lieux posés côté
    /// web/gateway — fixture gelée `v1-legacy-full.json`). `nil` pour un lieu
    /// choisi via MapKit, qui n'en a pas.
    public let id: String?

    public init(latitude: Double, longitude: Double,
                name: String? = nil, address: String? = nil, category: String? = nil,
                id: String? = nil) {
        self.latitude = latitude
        self.longitude = longitude
        self.name = name
        self.address = address
        self.category = category
        self.id = id
    }

    public var clLocationCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
