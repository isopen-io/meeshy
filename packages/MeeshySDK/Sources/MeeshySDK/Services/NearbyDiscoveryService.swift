import Foundation
import os

// MARK: - Une cellule de densité

/// Un comptage de publications découvrables sur UNE cellule de la grille du
/// serveur (`GET /posts/nearby/density`).
///
/// `cellLat`/`cellLng` sont le CENTRE de la cellule, déjà quantifié par le
/// gateway (`round(coord / step) * step`). La taille de la cellule ne voyage
/// pas dans la réponse : c'est celle que le client a demandée, calée sur l'un
/// des trois paliers de `NearbyDensityCellSize`.
public struct NearbyDensityCell: Decodable, Sendable, Equatable, Hashable {
    public let cellLat: Double
    public let cellLng: Double
    public let count: Int

    public init(cellLat: Double, cellLng: Double, count: Int) {
        self.cellLat = cellLat
        self.cellLng = cellLng
        self.count = count
    }
}

// MARK: - Le pas de grille

/// Les SEULES tailles de cellule que le serveur sait rendre.
///
/// `resolveDensityGridStepDegrees` (gateway) cale tout `cellSizeKm` reçu sur
/// l'un de ces trois paliers, sans le dire dans la réponse. Un client qui
/// demanderait 37 km recevrait donc des cellules de 100 km en croyant en avoir
/// de 37, et sa clé de cache — quantifiée sur une grille de 37 km — ne
/// retomberait jamais sur le même découpage. Caler ICI, avant de demander,
/// garde les deux côtés d'accord sur ce qui est comparé.
///
/// `EXACT` est délibérément absent, côté serveur comme ici : une densité sans
/// regroupement dégénère en un point par publication, ce qui n'est plus une
/// densité.
///
/// `degrees` DUPLIQUE le pas du serveur, et c'est assumé : la réponse ne porte
/// que des CENTRES de cellule, donc dessiner la cellule exige d'en connaître
/// le bord. Cette valeur ne quantifie AUCUNE coordonnée sortante — le client
/// n'arrondit jamais rien, ni en publiant, ni en cherchant.
public enum NearbyDensityCellSize: Sendable, CaseIterable, Equatable {
    case neighborhood
    case city
    case region

    /// Ce que le client met dans `cellSizeKm`.
    public var kilometers: Double {
        switch self {
        case .neighborhood: return 1
        case .city:         return 10
        case .region:       return 100
        }
    }

    /// Le pas de grille correspondant, en degrés — miroir du `GRID` du
    /// gateway. Sert au DESSIN de la cellule et à la clé de cache, jamais à
    /// une coordonnée envoyée.
    public var degrees: Double {
        switch self {
        case .neighborhood: return 0.01
        case .city:         return 0.1
        case .region:       return 1
        }
    }

    /// Le palier lisible pour un rayon donné : on veut de l'ordre d'une
    /// dizaine de cellules en travers de la zone regardée, jamais une seule
    /// cellule qui avale tout ni un semis illisible.
    public static func forRadius(kilometers radiusKm: Double) -> NearbyDensityCellSize {
        if radiusKm <= 5 { return .neighborhood }
        if radiusKm <= 50 { return .city }
        return .region
    }
}

// MARK: - Un post trouvé à proximité

/// Un post rendu par `GET /posts/nearby`, plus sa distance au point cherché.
///
/// Le gateway fusionne `distanceMeters` DANS l'objet post. `APIPost` ne
/// connaît pas cette clé et n'a aucune raison de la connaître : une distance
/// n'est pas une propriété du post, c'est une propriété de la RELATION entre
/// un lecteur et ce post — elle change à chaque pas que fait le lecteur. D'où
/// ce type, qui décode DEUX fois le même conteneur plutôt que d'élargir
/// `APIPost` (et de faire porter à toutes les autres surfaces un champ qui n'a
/// de sens que sur celle-ci).
public struct NearbyPost: Decodable, Sendable, Identifiable {
    private static let log = Logger(subsystem: "me.meeshy.sdk", category: "nearby-decode")

    public let post: APIPost
    /// Distance renvoyée par `$geoNear`, calculée depuis `Post.geoPoint` —
    /// c'est-à-dire depuis la coordonnée QUANTIFIÉE au grain choisi par
    /// l'auteur, jamais depuis sa position exacte. `nil` quand le serveur ne
    /// l'a pas fournie : jamais 0, qui se lirait « ici même ».
    public let distanceMeters: Double?

    /// **La coordonnée que l'auteur a CONSENTI à rendre trouvable**, déjà
    /// quantifiée par le serveur au grain de `geoPrecision`.
    ///
    /// C'est elle — et jamais `post.location` — qui doit planter le pin. Le
    /// badge affiché est une AUTRE donnée, servie par une autre porte
    /// (`metadata.location`, au grain de `LocationSharingPreferences`) : la
    /// dessiner sur la carte de découverte reviendrait à situer au mètre près
    /// quelqu'un qui a choisi « Région », et à contredire, sur le même écran,
    /// la distance servie par le serveur — elle, mesurée depuis ce point-ci.
    ///
    /// `nil` seulement si le serveur ne l'a pas rendue : la route ne peut de
    /// toute façon élire que des publications qui en portent une.
    public let geoPoint: NearbyGeoPoint?

    /// Le grain revendiqué par l'auteur. Sert à CERNER le pin — un point
    /// quantifié à 1° dessiné sans son cercle se lit comme une adresse.
    public let geoPrecision: DiscoverabilityPrecision?

    public var id: String { post.id }

    private enum CodingKeys: String, CodingKey {
        case distanceMeters
        case geoPoint
        case geoPrecision
    }

    public init(from decoder: Decoder) throws {
        post = try APIPost(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        distanceMeters = try container.decodeIfPresent(Double.self, forKey: .distanceMeters)
        // Ces deux champs sont TOLÉRÉS illisibles, et le sont explicitement :
        // un `geoPoint` d'une forme inattendue ferait autrement échouer le
        // décodage du document ENTIER, donc disparaître la publication du
        // résultat — le défaut Android de la mémoire du dépôt, rejoué ici.
        // L'anomalie se lit dans le journal ; elle n'efface personne.
        geoPoint = Self.decodeTolerantly(NearbyGeoPoint.self, from: container, forKey: .geoPoint)
        geoPrecision = Self.decodeTolerantly(
            DiscoverabilityPrecision.self, from: container, forKey: .geoPrecision
        )
    }

    private static func decodeTolerantly<T: Decodable>(
        _ type: T.Type,
        from container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) -> T? {
        do {
            return try container.decodeIfPresent(type, forKey: key)
        } catch {
            log.error(
                "nearby: \(key.stringValue, privacy: .public) illisible — \(error.localizedDescription, privacy: .public)"
            )
            return nil
        }
    }

    public init(
        post: APIPost,
        distanceMeters: Double?,
        geoPoint: NearbyGeoPoint? = nil,
        geoPrecision: DiscoverabilityPrecision? = nil
    ) {
        self.post = post
        self.distanceMeters = distanceMeters
        self.geoPoint = geoPoint
        self.geoPrecision = geoPrecision
    }
}

// MARK: - Le point consenti

/// Un `Post.geoPoint` — GeoJSON `{ type: "Point", coordinates: [lng, lat] }`.
///
/// L'ORDRE est le piège : GeoJSON écrit la longitude EN PREMIER, l'inverse de
/// toutes les signatures `CLLocationCoordinate2D` du dépôt. Le lire à
/// l'envers ne lève aucune erreur — il déplace simplement chaque publication
/// à un endroit plausible du globe, ce que personne ne remarque avant une
/// capture d'écran.
public struct NearbyGeoPoint: Decodable, Sendable, Equatable, Hashable {
    public let latitude: Double
    public let longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    private enum CodingKeys: String, CodingKey {
        case coordinates
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let coordinates = try container.decode([Double].self, forKey: .coordinates)
        guard coordinates.count >= 2 else {
            throw DecodingError.dataCorruptedError(
                forKey: .coordinates,
                in: container,
                debugDescription: "GeoJSON Point attend [lng, lat]"
            )
        }
        longitude = coordinates[0]
        latitude = coordinates[1]
    }
}

// MARK: - La pagination de /posts/nearby

/// `GET /posts/nearby` ne pagine PAS comme le feed.
///
/// Un tri par distance n'a pas de frontière naturelle autre que « combien
/// déjà vus » : le gateway y attend donc un OFFSET numérique
/// (`z.coerce.number().int().min(0)`) et rend `nextCursor` comme sa
/// représentation décimale. Envoyer le curseur opaque `createdAt+id` du feed
/// rendrait 400 VALIDATION_ERROR — un écran vide de plus, sans cause lisible.
public enum NearbyDiscoveryPage {
    /// Relit l'offset suivant. Rend `nil` — donc « fin de pagination » —
    /// plutôt que de renvoyer au serveur une valeur qu'il refuserait.
    public static func nextOffset(from cursor: String?) -> Int? {
        guard let cursor, let offset = Int(cursor), offset >= 0 else { return nil }
        return offset
    }
}

// MARK: - La forme des requêtes

/// Les bornes du gateway et la clé de cache, en fonctions PURES.
///
/// Elles vivent hors du service pour une raison simple : ce sont elles qui
/// portent la règle, et une règle enfermée dans un appel réseau ne se teste
/// qu'à travers un mock. Le service, lui, n'a plus qu'à les appliquer.
public enum NearbyDiscoveryQuery {

    /// Antipode terrestre — même borne que `MAX_RADIUS_KM` du gateway.
    public static let maxRadiusKm: Double = 20_000
    /// `z.coerce.number().int().min(1).max(50)` côté gateway.
    public static let maxLimit = 50
    public static let minLimit = 1

    public static func clampedRadius(_ radiusKm: Double) -> Double {
        min(max(radiusKm, 0.001), maxRadiusKm)
    }

    public static func clampedLimit(_ limit: Int) -> Int {
        min(max(limit, minLimit), maxLimit)
    }

    public static func clampedCursor(_ cursor: Int) -> Int {
        max(cursor, 0)
    }

    /// Les coordonnées partent telles quelles. `Double.description` est la
    /// plus courte forme qui refait exactement le même nombre — aucun arrondi
    /// n'est introduit ici, et c'est le point : le client ne quantifie rien.
    public static func nearbyItems(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cursor: Int,
        limit: Int
    ) -> [URLQueryItem] {
        [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "radiusKm", value: String(clampedRadius(radiusKm))),
            URLQueryItem(name: "cursor", value: String(clampedCursor(cursor))),
            URLQueryItem(name: "limit", value: String(clampedLimit(limit))),
        ]
    }

    public static func densityItems(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cellSize: NearbyDensityCellSize
    ) -> [URLQueryItem] {
        [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "radiusKm", value: String(clampedRadius(radiusKm))),
            URLQueryItem(name: "cellSizeKm", value: String(cellSize.kilometers)),
        ]
    }

    /// La clé sous laquelle le lot de résultats est mis en cache.
    ///
    /// Quantifiée sur la grille de densité du rayon demandé : sans ça, chaque
    /// micro-déplacement de carte fabrique une clé neuve, le cache ne touche
    /// jamais et l'écran repart d'un squelette à chaque geste — un écran
    /// cache-first qui se comporte en écran réseau-seul, sans que rien ne le
    /// dise.
    ///
    /// Cet arrondi porte sur une clé LOCALE, jamais sur une coordonnée
    /// envoyée : les requêtes partent au chiffre près (voir `nearbyItems`).
    public static func cacheKey(latitude: Double, longitude: Double, radiusKm: Double) -> String {
        let radius = clampedRadius(radiusKm)
        let cell = NearbyDensityCellSize.forRadius(kilometers: radius)
        let step = cell.degrees
        let lat = (latitude / step).rounded() * step
        let lng = (longitude / step).rounded() * step
        return "nearby:\(String(format: "%.4f", lat)),\(String(format: "%.4f", lng)),\(String(format: "%.3f", radius))"
    }
}

// MARK: - Protocol

public protocol NearbyDiscoveryServiceProviding: Sendable {
    /// `GET /posts/nearby` — publications découvrables triées par distance.
    /// `cursor` est un OFFSET, pas le curseur opaque du feed.
    func nearby(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cursor: Int,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[NearbyPost]>

    /// `GET /posts/nearby/density` — comptage par cellule, volontairement plus
    /// léger : aucun contenu de publication ne traverse cette route.
    func density(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cellSize: NearbyDensityCellSize
    ) async throws -> [NearbyDensityCell]
}

// MARK: - Service

/// Le client des deux routes de découverte géographique (spec du 2026-08-02
/// §3). Volontairement mince : il applique les bornes de
/// `NearbyDiscoveryQuery` et rend ce que le serveur a dit.
///
/// Ce qu'il ne fait PAS, et qui est le fond du sujet : aucune décision de
/// produit. Quel rayon, quel mode d'affichage, quoi dire quand c'est vide —
/// tout cela vit côté app, avec les singletons Meeshy. Ici, des paramètres
/// opaques et rien d'autre.
public final class NearbyDiscoveryService: NearbyDiscoveryServiceProviding, @unchecked Sendable {
    public static let shared = NearbyDiscoveryService()

    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func nearby(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cursor: Int = 0,
        limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[NearbyPost]> {
        try await api.request(
            PostsEndpoint.nearby,
            method: "GET",
            body: nil,
            queryItems: NearbyDiscoveryQuery.nearbyItems(
                latitude: latitude,
                longitude: longitude,
                radiusKm: radiusKm,
                cursor: cursor,
                limit: limit
            )
        )
    }

    public func density(
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        cellSize: NearbyDensityCellSize
    ) async throws -> [NearbyDensityCell] {
        let response: APIResponse<[NearbyDensityCell]> = try await api.request(
            PostsEndpoint.nearbyDensity,
            method: "GET",
            body: nil,
            queryItems: NearbyDiscoveryQuery.densityItems(
                latitude: latitude,
                longitude: longitude,
                radiusKm: radiusKm,
                cellSize: cellSize
            )
        )
        return response.data
    }
}
