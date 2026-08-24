import Foundation

// MARK: - Précision de partage

/// À quel grain la position de l'utilisateur est transmise.
///
/// L'enum ne porte AUCUN libellé : c'est de la donnée. Les libellés
/// (« Quartier », « ~1 km ») vivent côté app, dans
/// `LocationSharingSettingsSection`. Mettre des chaînes ici obligerait à
/// alimenter le catalogue `.module` du SDK et reproduirait le défaut de
/// `LiveLocationDuration.displayText`, qui rend du français en dur quelle que
/// soit la langue de l'interface.
public enum LocationPrecision: String, Codable, CaseIterable, Sendable {
    /// Aucun arrondi — au mieux de ce que rend le GPS.
    case exact
    /// ~100 m.
    case around
    /// ~1 km.
    case neighborhood
    /// ~10 km.
    case city

    /// Décimales conservées sur latitude et longitude. `nil` = pas d'arrondi.
    ///
    /// 1 décimale de latitude ≈ 11 km, 2 ≈ 1,1 km, 3 ≈ 111 m — d'où la
    /// correspondance avec les rayons annoncés.
    public var decimalPlaces: Int? {
        switch self {
        case .exact:        return nil
        case .around:       return 3
        case .neighborhood: return 2
        case .city:         return 1
        }
    }

    /// Rayon d'imprécision annoncé à l'utilisateur, en mètres.
    public var approximateRadiusMeters: Double? {
        switch self {
        case .exact:        return nil
        case .around:       return 100
        case .neighborhood: return 1_000
        case .city:         return 10_000
        }
    }

    /// Applique la dégradation au lieu choisi.
    ///
    /// Arrondir les coordonnées ne suffit pas : envoyer
    /// « 12 rue de la Paix, Paris » avec une position à ±10 km annulerait
    /// l'arrondi. Aux deux paliers grossiers, le nom et l'adresse sont donc
    /// REMPLACÉS par le composant géographique de granularité correspondante,
    /// et la catégorie POI est vidée — « restaurant » à ±10 km reste une fuite
    /// sur ce que fait la personne.
    ///
    /// Quand aucun composant n'est disponible (plein océan, désert), le
    /// résultat ne porte que les coordonnées arrondies. C'est une dégradation
    /// propre, pas une erreur.
    public func coarsen(_ place: SharedPlace, names: PlaceCoarseNames) -> SharedPlace {
        guard let places = decimalPlaces else { return place }

        let latitude = Self.round(place.latitude, to: places)
        let longitude = Self.round(place.longitude, to: places)

        switch self {
        case .exact:
            // Inatteignable — `decimalPlaces` est `nil` pour `.exact` et la
            // garde ci-dessus a déjà rendu. Le cas reste requis par
            // l'exhaustivité du `switch`.
            return place
        case .around:
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: place.name, address: place.address, category: place.category
            )
        case .neighborhood:
            let name = names.subLocality ?? names.locality
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: name,
                address: Self.join([names.locality, names.country], excluding: name),
                category: nil
            )
        case .city:
            let name = names.locality ?? names.administrativeArea
            return SharedPlace(
                latitude: latitude, longitude: longitude,
                name: name,
                address: Self.join([names.administrativeArea, names.country], excluding: name),
                category: nil
            )
        }
    }

    /// Arrondi au plus proche en s'éloignant de zéro, donc symétrique :
    /// `-33.8678` et `33.8678` s'arrondissent au même écart.
    /// `Double.rounded()` applique déjà `.toNearestOrAwayFromZero`.
    private static func round(_ value: Double, to places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (value * factor).rounded() / factor
    }

    /// Joint les composants non vides, en écartant celui déjà utilisé comme
    /// nom — sinon « Paris » apparaîtrait deux fois quand `subLocality` manque.
    private static func join(_ parts: [String?], excluding name: String?) -> String? {
        let kept = parts.compactMap { $0 }.filter { $0 != name }
        return kept.isEmpty ? nil : kept.joined(separator: ", ")
    }
}

// MARK: - Composants géographiques

/// Les composants d'un `CLPlacemark` conservés SÉPARÉMENT, pour que la
/// dégradation puisse choisir le bon grain. Le picker les aplatit aujourd'hui
/// en une seule chaîne d'adresse, ce qui rend impossible de n'en garder que le
/// quartier ou la ville.
public struct PlaceCoarseNames: Equatable, Sendable {
    public let subLocality: String?
    public let locality: String?
    public let administrativeArea: String?
    public let country: String?

    public init(
        subLocality: String? = nil,
        locality: String? = nil,
        administrativeArea: String? = nil,
        country: String? = nil
    ) {
        self.subLocality = subLocality
        self.locality = locality
        self.administrativeArea = administrativeArea
        self.country = country
    }

    public static let empty = PlaceCoarseNames()
}

// MARK: - Style de carte

/// Rendu de la carte. `imagery` = satellite sans étiquettes, `hybrid` =
/// satellite avec étiquettes — la distinction d'`MKMapConfiguration`.
public enum SharedMapStyle: String, Codable, CaseIterable, Sendable {
    case standard
    case hybrid
    case imagery
}

// MARK: - Préférences

/// Préférences APPLICATIVES de partage de position — pas par conversation.
/// Persistées par `LocationSharingPreferencesStore` (MeeshyUI).
public struct LocationSharingPreferences: Codable, Equatable, Sendable {
    public var precision: LocationPrecision
    public var mapStyle: SharedMapStyle
    /// Dernier grain de DÉCOUVRABILITÉ réellement utilisé pour publier — la
    /// mémoire locale que la spec du 2026-08-02 §2 demande, « préférence
    /// locale device, pas un réglage serveur ».
    ///
    /// Elle vit ici, et non dans un second magasin, parce que les deux grains
    /// se lisent ENSEMBLE à chaque publication : `precision` borne ce que
    /// celui-ci peut honnêtement revendiquer (`DiscoverabilityPrecision
    /// .allowedTiers(under:)`). Deux magasins auraient fabriqué deux
    /// lectures à garder synchronisées pour une seule décision.
    ///
    /// `nil` — le défaut — n'active RIEN. Ce champ ne dit pas « rends mes
    /// publications trouvables » : il dit « voici le palier à PRÉ-SÉLECTIONNER
    /// dans le sélecteur si l'utilisateur ouvre l'interrupteur ». L'opt-in
    /// lui-même est par publication et repart fermé à chaque fois.
    public var lastDiscoverabilityPrecision: DiscoverabilityPrecision?

    public init(
        precision: LocationPrecision = .exact,
        mapStyle: SharedMapStyle = .standard,
        lastDiscoverabilityPrecision: DiscoverabilityPrecision? = nil
    ) {
        self.precision = precision
        self.mapStyle = mapStyle
        self.lastDiscoverabilityPrecision = lastDiscoverabilityPrecision
    }

    /// `exact` / `standard` : le comportement actuel. Changer silencieusement
    /// la précision de partage d'un utilisateur existant serait une régression
    /// fonctionnelle déguisée en réglage.
    public static let defaults = LocationSharingPreferences()
}
