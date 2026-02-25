import Foundation
import CoreLocation

// MARK: - Location Coordinate

public struct MeeshyLocationCoordinate: Codable, Equatable {
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?

    public init(latitude: Double, longitude: Double, altitude: Double? = nil, accuracy: Double? = nil) {
        self.latitude = latitude; self.longitude = longitude
        self.altitude = altitude; self.accuracy = accuracy
    }

    public var clLocationCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

// MARK: - Static Location Share

public struct LocationSharePayload: Encodable {
    public let conversationId: String
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?
    public let placeName: String?
    public let address: String?

    public init(conversationId: String, latitude: Double, longitude: Double,
                altitude: Double? = nil, accuracy: Double? = nil,
                placeName: String? = nil, address: String? = nil) {
        self.conversationId = conversationId
        self.latitude = latitude; self.longitude = longitude
        self.altitude = altitude; self.accuracy = accuracy
        self.placeName = placeName; self.address = address
    }
}

public struct LocationSharedEvent: Decodable {
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?
    public let placeName: String?
    public let address: String?
    public let timestamp: Date?
}

// MARK: - Live Location Sharing

public enum LiveLocationDuration: Int, CaseIterable, Identifiable {
    case fifteenMinutes = 15
    case thirtyMinutes = 30
    case oneHour = 60
    case twoHours = 120
    case eightHours = 480

    public var id: Int { rawValue }

    public var displayText: String {
        switch self {
        case .fifteenMinutes: return "15 min"
        case .thirtyMinutes: return "30 min"
        case .oneHour: return "1 heure"
        case .twoHours: return "2 heures"
        case .eightHours: return "8 heures"
        }
    }
}

public struct LiveLocationStartPayload: Encodable {
    public let conversationId: String
    public let latitude: Double
    public let longitude: Double
    public let durationMinutes: Int

    public init(conversationId: String, latitude: Double, longitude: Double, durationMinutes: Int) {
        self.conversationId = conversationId
        self.latitude = latitude; self.longitude = longitude
        self.durationMinutes = durationMinutes
    }
}

public struct LiveLocationStartedEvent: Decodable {
    public let conversationId: String
    public let userId: String
    public let username: String
    public let latitude: Double
    public let longitude: Double
    public let durationMinutes: Int
    public let expiresAt: Date?
    public let startedAt: Date?
}

public struct LiveLocationUpdatePayload: Encodable {
    public let conversationId: String
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?
    public let speed: Double?
    public let heading: Double?

    public init(conversationId: String, latitude: Double, longitude: Double,
                altitude: Double? = nil, accuracy: Double? = nil,
                speed: Double? = nil, heading: Double? = nil) {
        self.conversationId = conversationId
        self.latitude = latitude; self.longitude = longitude
        self.altitude = altitude; self.accuracy = accuracy
        self.speed = speed; self.heading = heading
    }
}

public struct LiveLocationUpdatedEvent: Decodable {
    public let conversationId: String
    public let userId: String
    public let latitude: Double
    public let longitude: Double
    public let altitude: Double?
    public let accuracy: Double?
    public let speed: Double?
    public let heading: Double?
    public let timestamp: Date?
}

public struct LiveLocationStoppedEvent: Decodable {
    public let conversationId: String
    public let userId: String
    public let stoppedAt: Date?
}

// MARK: - Active Live Location Session

public struct ActiveLiveLocation: Identifiable {
    public let id: String
    public let userId: String
    public let username: String
    public var latitude: Double
    public var longitude: Double
    public var speed: Double?
    public var heading: Double?
    public let expiresAt: Date
    public let startedAt: Date
    public var lastUpdated: Date

    public init(userId: String, username: String, latitude: Double, longitude: Double,
                speed: Double? = nil, heading: Double? = nil,
                expiresAt: Date, startedAt: Date, lastUpdated: Date = Date()) {
        self.id = userId
        self.userId = userId; self.username = username
        self.latitude = latitude; self.longitude = longitude
        self.speed = speed; self.heading = heading
        self.expiresAt = expiresAt; self.startedAt = startedAt
        self.lastUpdated = lastUpdated
    }

    public var isExpired: Bool {
        Date() >= expiresAt
    }

    public var remainingTime: TimeInterval {
        max(0, expiresAt.timeIntervalSince(Date()))
    }

    public var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
