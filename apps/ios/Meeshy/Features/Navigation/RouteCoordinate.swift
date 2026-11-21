import CoreLocation

/// Une coordonnée transportable par une `Route`.
///
/// `CLLocationCoordinate2D` n'est ni `Hashable` ni `Equatable` : glissée telle
/// quelle dans une case d'énumération, elle ferait perdre à `Route` sa
/// conformance et TOUTE la pile de navigation cesserait de compiler. Ce
/// porteur existe pour ça, et pour rien d'autre — il ne transforme aucune
/// valeur.
///
/// Aucun arrondi ici non plus : un point touché sur un post doit rouvrir la
/// carte EXACTEMENT là où l'utilisateur a tapé.
struct RouteCoordinate: Hashable {
    let latitude: Double
    let longitude: Double

    init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(latitude: coordinate.latitude, longitude: coordinate.longitude)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
