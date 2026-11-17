import Foundation

// LA POSITION DU SANG, CÔTÉ iOS (#13937 pour la passerelle, #18872 pour l'écran). Le contrat est
// `packages/shared/types/blood-location.ts` ; ce fichier en est la lecture Swift. Tout vit derrière un drapeau serveur
// (`GET /relations/config` → `services.bloodLocation`) : un client qui ne le lit pas, ou le lit faux, n'appelle rien.
// Ces types ne jugent aucun droit (la passerelle rejuge à chaque appel) ; ils bornent ce qui entre et ce qui part comme
// le serveur le borne, pour qu'une charge absurde ne traverse jamais jusqu'à la carte ni jusqu'au réseau.

public enum BloodLocationContract {
    /// `BLOOD_LOCATION_HISTORY_DAYS` : l'historique couvre au plus trente jours.
    public static let historyDays = 30
    /// `BLOOD_LOCATION_HISTORY_MAX_LIMIT`.
    public static let historyMaxLimit = 500
    /// `BLOOD_PROXIMITY_MIN_RADIUS_METERS` … `BLOOD_PROXIMITY_MAX_RADIUS_METERS`.
    public static let proximityRadiusRange: ClosedRange<Int> = 100...5000
}

/// Un point de l'historique servi : où, et quand. Jamais plus.
public struct BloodLocationPoint: Decodable, Sendable, Equatable {
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?
    public let recordedAt: Date

    public init(latitude: Double, longitude: Double, accuracy: Double? = nil, recordedAt: Date) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.recordedAt = recordedAt
    }

    private enum CodingKeys: String, CodingKey { case latitude, longitude, accuracy, recordedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let latitude = try c.decode(Double.self, forKey: .latitude)
        let longitude = try c.decode(Double.self, forKey: .longitude)
        guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else {
            throw DecodingError.dataCorruptedError(forKey: .latitude, in: c, debugDescription: "coordonnée hors du globe")
        }
        guard let recordedAt = WireDate.date(from: try c.decode(String.self, forKey: .recordedAt)) else {
            throw DecodingError.dataCorruptedError(forKey: .recordedAt, in: c, debugDescription: "instant illisible")
        }
        let accuracy: Double? = (try? c.decodeIfPresent(Double.self, forKey: .accuracy)) ?? nil
        self.init(latitude: latitude, longitude: longitude,
                  accuracy: accuracy.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }, recordedAt: recordedAt)
    }
}

/// `GET /relations/:userId/location/history` — rangé du plus ancien au plus récent ; un point illisible est écarté sans
/// faire tomber la réponse. Le fantôme sert la même réponse VIDE : l'écran ne distingue pas « rien » de « caché ».
public struct BloodLocationHistory: Decodable, Sendable, Equatable {
    public let points: [BloodLocationPoint]

    public init(points: [BloodLocationPoint]) {
        self.points = points.sorted { $0.recordedAt < $1.recordedAt }
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([BloodLocationLenient<BloodLocationPoint>].self, forKey: .items)) ?? nil
        self.init(points: (lenient ?? []).compactMap(\.value))
    }
}

/// Qui a lu mon historique, et quand. Visible de moi seul.
public struct BloodLocationConsultation: Decodable, Sendable, Equatable {
    public let observerId: String
    public let consultedAt: Date

    public init(observerId: String, consultedAt: Date) {
        self.observerId = observerId
        self.consultedAt = consultedAt
    }

    private enum CodingKeys: String, CodingKey { case observerId, consultedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let observerId = try c.decode(String.self, forKey: .observerId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !observerId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .observerId, in: c, debugDescription: "observerId vide")
        }
        guard let consultedAt = WireDate.date(from: try c.decode(String.self, forKey: .consultedAt)) else {
            throw DecodingError.dataCorruptedError(forKey: .consultedAt, in: c, debugDescription: "instant illisible")
        }
        self.init(observerId: observerId, consultedAt: consultedAt)
    }
}

/// `GET /me/location/consultations` — le journal, du plus récent au plus ancien, et qui lit trop souvent.
public struct BloodLocationConsultations: Decodable, Sendable, Equatable {
    public let items: [BloodLocationConsultation]
    public let excessive: Bool
    public let excessiveObserverIds: [String]

    public init(items: [BloodLocationConsultation], excessive: Bool = false, excessiveObserverIds: [String] = []) {
        self.items = items.sorted { $0.consultedAt > $1.consultedAt }
        self.excessiveObserverIds = excessiveObserverIds
        self.excessive = excessive || !excessiveObserverIds.isEmpty
    }

    private enum CodingKeys: String, CodingKey { case items, excessive, excessiveObserverIds }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let items = ((try? c.decodeIfPresent([BloodLocationLenient<BloodLocationConsultation>].self, forKey: .items)) ?? nil) ?? []
        let excessive = ((try? c.decodeIfPresent(Bool.self, forKey: .excessive)) ?? nil) ?? false
        let observers = ((try? c.decodeIfPresent([String].self, forKey: .excessiveObserverIds)) ?? nil) ?? []
        self.init(items: items.compactMap(\.value), excessive: excessive, excessiveObserverIds: observers)
    }

    /// Le nombre de lectures par observateur, du plus fréquent au plus rare (ordre d'identifiant à égalité).
    public var countsByObserver: [(observerId: String, count: Int)] {
        Dictionary(grouping: items, by: \.observerId)
            .map { (observerId: $0.key, count: $0.value.count) }
            .sorted { ($1.count, $0.observerId) < ($0.count, $1.observerId) }
    }
}

/// `PUT /me/location/blood-settings` — le fantôme (global ou pour une personne) et le rayon de proximité (par personne).
/// `nil` quand la passerelle refuserait : aucun réglage, ou un rayon sans personne. Le rayon est borné comme le schéma.
public struct BloodLocationSettingsChange: Encodable, Sendable, Equatable {
    public let userId: String?
    public let ghost: Bool?
    public let proximityRadiusMeters: Int?

    public init?(userId: String? = nil, ghost: Bool? = nil, proximityRadiusMeters: Int? = nil) {
        let target = userId?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let target, target.range(of: "^[0-9a-f]{24}$", options: .regularExpression) == nil { return nil }
        guard ghost != nil || proximityRadiusMeters != nil else { return nil }
        guard proximityRadiusMeters == nil || target != nil else { return nil }
        let range = BloodLocationContract.proximityRadiusRange
        self.userId = target
        self.ghost = ghost
        self.proximityRadiusMeters = proximityRadiusMeters.map { min(max($0, range.lowerBound), range.upperBound) }
    }

    private enum CodingKeys: String, CodingKey { case userId, ghost, proximityRadiusMeters }

    /// Le schéma serveur est `strict` : une clé absente ne part pas, jamais un `null`.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(userId, forKey: .userId)
        try c.encodeIfPresent(ghost, forKey: .ghost)
        try c.encodeIfPresent(proximityRadiusMeters, forKey: .proximityRadiusMeters)
    }
}

/// Un élément illisible d'une liste servie est écarté, il ne fait pas tomber la liste.
private struct BloodLocationLenient<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}
