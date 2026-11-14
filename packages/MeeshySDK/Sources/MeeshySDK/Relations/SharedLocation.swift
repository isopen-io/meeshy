import Foundation

// LE PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980), côté RÉCEPTION sur iOS (#16983).
// Le contrat est `packages/shared/types/shared-location.ts` ; ce fichier en est la lecture Swift. La passerelle a déjà
// tronqué chaque position à la précision que son émetteur m'a donnée (exacte, quartier, ville) : un flou arrive posé au
// centre de sa maille, avec le rayon du cercle à dessiner. Ce décodeur ne garde que les champs du contrat, bornés comme
// le serveur les borne : une coordonnée hors du globe, une précision inconnue ou un rayon absurde ne traversent jamais
// jusqu'à la carte, et la précision réelle de l'appareil émetteur n'a pas de champ où se poser.

public enum SharedLocationContract {
    /// `SHARED_LOCATION_DURATIONS_MINUTES` : un partage dure au plus 8 h ; une échéance plus lointaine est bornée.
    public static let maxLifetime: TimeInterval = 8 * 3600
    /// `SHARED_LOCATION_EXACT_MIN_RADIUS_METERS` : même `exact`, le cercle ne descend pas sous 10 m.
    public static let exactMinRadiusMeters: Double = 10
    /// `sharedLocationPositionSchema.accuracy` : au-delà, le rayon servi n'a plus de sens.
    public static let maxRadiusMeters: Double = 100_000
}

/// `SHARED_LOCATION_PRECISIONS` : ce que l'émetteur a choisi de me montrer.
public enum SharedLocationPrecision: String, Sendable, Equatable, CaseIterable {
    case exact
    case neighborhood
    case city
}

/// `location:share-changed` — la position d'UNE personne, déjà tronquée pour MOI.
public struct SharedLocationChanged: Decodable, Sendable, Equatable {
    public let userId: String
    public let latitude: Double
    public let longitude: Double
    public let precision: SharedLocationPrecision
    public let radiusMeters: Double
    public let updatedAt: Date
    public let expiresAt: Date

    public init(userId: String, latitude: Double, longitude: Double, precision: SharedLocationPrecision,
                radiusMeters: Double, updatedAt: Date, expiresAt: Date) {
        self.userId = userId
        self.latitude = latitude
        self.longitude = longitude
        self.precision = precision
        self.radiusMeters = min(SharedLocationContract.maxRadiusMeters, max(SharedLocationContract.exactMinRadiusMeters, radiusMeters))
        self.updatedAt = updatedAt
        self.expiresAt = expiresAt
    }

    /// La durée de vie servie, bornée par le contrat : une échéance absurde ne garde jamais une position affichée.
    public var lifetime: TimeInterval {
        min(SharedLocationContract.maxLifetime, max(0, expiresAt.timeIntervalSince(updatedAt)))
    }

    private enum CodingKeys: String, CodingKey { case userId, latitude, longitude, precision, radiusMeters, updatedAt, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        let latitude = try c.decode(Double.self, forKey: .latitude)
        let longitude = try c.decode(Double.self, forKey: .longitude)
        guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else {
            throw DecodingError.dataCorruptedError(forKey: .latitude, in: c, debugDescription: "coordonnée hors du globe")
        }
        guard let precision = SharedLocationPrecision(rawValue: try c.decode(String.self, forKey: .precision)) else {
            throw DecodingError.dataCorruptedError(forKey: .precision, in: c, debugDescription: "précision inconnue")
        }
        let radius = try c.decode(Double.self, forKey: .radiusMeters)
        guard radius.isFinite, radius >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .radiusMeters, in: c, debugDescription: "rayon illisible")
        }
        guard let updatedAt = WireDate.date(from: try c.decode(String.self, forKey: .updatedAt)),
              let expiresAt = WireDate.date(from: try c.decode(String.self, forKey: .expiresAt)) else {
            throw DecodingError.dataCorruptedError(forKey: .updatedAt, in: c, debugDescription: "instant illisible")
        }
        self.init(userId: userId, latitude: latitude, longitude: longitude, precision: precision,
                  radiusMeters: radius, updatedAt: updatedAt, expiresAt: expiresAt)
    }
}

/// `location:share-ended` — le partage de cette personne s'arrête chez moi (arrêt, baisse sous Ami, blocage, retrait).
public struct SharedLocationEnded: Decodable, Sendable, Equatable {
    public let userId: String

    public init(userId: String) {
        self.userId = userId
    }
}

/// `GET /relations/locations` — les partages servis à MOI, déjà tronqués. Un élément illisible est écarté, il ne fait
/// pas tomber le rattrapage.
public struct SharedLocationSnapshot: Decodable, Sendable, Equatable {
    public let items: [SharedLocationChanged]

    public init(items: [SharedLocationChanged]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: SharedLocationChanged?

        init(from decoder: Decoder) throws {
            value = try? SharedLocationChanged(from: decoder)
        }
    }
}

/// L'emprise visible d'une carte, au format que la passerelle lit (`bbox=minLon,minLat,maxLon,maxLat`). Elle est
/// normalisée à la construction : une emprise inversée ou hors du globe n'existe pas (`nil`), le serveur la refuserait.
public struct SharedLocationBounds: Sendable, Equatable {
    public let minLongitude: Double
    public let minLatitude: Double
    public let maxLongitude: Double
    public let maxLatitude: Double

    public init?(minLongitude: Double, minLatitude: Double, maxLongitude: Double, maxLatitude: Double) {
        let values = [minLongitude, minLatitude, maxLongitude, maxLatitude]
        guard values.allSatisfy(\.isFinite),
              abs(minLatitude) <= 90, abs(maxLatitude) <= 90,
              abs(minLongitude) <= 180, abs(maxLongitude) <= 180,
              minLatitude <= maxLatitude, minLongitude <= maxLongitude else { return nil }
        self.minLongitude = minLongitude
        self.minLatitude = minLatitude
        self.maxLongitude = maxLongitude
        self.maxLatitude = maxLatitude
    }

    /// La valeur de `bbox`, dans l'ordre que lit `parseBbox` côté passerelle.
    public var queryValue: String {
        [minLongitude, minLatitude, maxLongitude, maxLatitude].map { String($0) }.joined(separator: ",")
    }

    /// Le serveur filtre sur la position SERVIE : la même règle départage ce que le rattrapage fait foi.
    public func contains(latitude: Double, longitude: Double) -> Bool {
        (minLatitude...maxLatitude).contains(latitude) && (minLongitude...maxLongitude).contains(longitude)
    }
}
