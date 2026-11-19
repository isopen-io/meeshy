import Foundation

// LE RELEVÉ DU SANG (#13937 pour la passerelle, #18872 pour iOS) : `POST /me/location/blood` range un point de MON
// historique, scellé au repos trente jours, que seuls les Sangs qui me l'ont consenti relisent. Ces règles disent ce
// qui part et quand ; elles ne jugent aucun droit (la passerelle rejuge, et ne range rien en fantôme global).

/// Un relevé de l'appareil prêt à partir : où, et à combien de mètres près. Jamais plus.
public struct BloodLocationReading: Encodable, Sendable, Equatable {
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?

    /// `nil` : un relevé hors du globe ou non fini ne part jamais. Une précision illisible est omise, une précision
    /// démesurée est bornée comme le schéma serveur (`accuracy ≤ 100 000`).
    public init?(latitude: Double, longitude: Double, accuracy: Double? = nil) {
        guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else { return nil }
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy.flatMap { $0.isFinite && $0 >= 0 ? min($0, 100_000) : nil }
    }

    private enum CodingKeys: String, CodingKey { case latitude, longitude, accuracy }

    /// Une précision absente ne part pas : jamais un `null`.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(latitude, forKey: .latitude)
        try c.encode(longitude, forKey: .longitude)
        try c.encodeIfPresent(accuracy, forKey: .accuracy)
    }
}

/// Quand un relevé mérite d'être rangé : il faut quelqu'un pour le relire, et un changement qui dise quelque chose.
public enum BloodLocationRecordGate {
    /// Un pas plus court ne trace aucun chemin : c'est le même lieu.
    public static let minimumDistanceMeters: Double = 200
    /// Immobile, un point toutes les quinze minutes suffit à dire un arrêt (`BloodHistoryRules.stopMinimumDuration`).
    public static let minimumInterval: TimeInterval = 15 * 60
    /// Au-delà, le relevé ne situe plus personne : il ne part pas.
    public static let maximumAccuracyMeters: Double = 1_000

    /// Le relevé est-il un changement au regard du dernier point rangé : assez loin, ou assez tard ?
    public static func isDue(_ reading: BloodLocationReading, at now: Date, after last: BloodLocationPoint?) -> Bool {
        if let accuracy = reading.accuracy, accuracy > maximumAccuracyMeters { return false }
        guard let last else { return true }
        if now.timeIntervalSince(last.recordedAt) >= minimumInterval { return true }
        let moved = LocationMapRules.distanceMeters(fromLatitude: last.latitude, fromLongitude: last.longitude,
                                                    toLatitude: reading.latitude, toLongitude: reading.longitude)
        return moved >= minimumDistanceMeters
    }

    /// Ranger un point n'a de sens que si au moins un lien est un Sang : sinon rien ne part, rien ne se garde.
    public static func hasAudience(_ links: [RelationLink]) -> Bool {
        links.contains { $0.effectiveLevel == .blood }
    }
}
