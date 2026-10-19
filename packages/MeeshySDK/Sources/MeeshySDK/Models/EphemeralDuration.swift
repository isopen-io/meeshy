import Foundation
import UIKit

public enum EphemeralDuration: Int, CaseIterable, Identifiable, Sendable {
    case fifteenSeconds = 15
    case thirtySeconds = 30
    case oneMinute = 60
    case fiveMinutes = 300
    case oneHour = 3600
    case twentyFourHours = 86400

    public var id: Int { rawValue }

    public var label: String {
        switch self {
        case .fifteenSeconds: return "15s"
        case .thirtySeconds: return "30s"
        case .oneMinute: return "1min"
        case .fiveMinutes: return "5min"
        case .oneHour: return "1h"
        case .twentyFourHours: return "24h"
        }
    }

    public var displayLabel: String {
        switch self {
        case .fifteenSeconds: return "15 secondes"
        case .thirtySeconds: return "30 secondes"
        case .oneMinute: return "1 minute"
        case .fiveMinutes: return "5 minutes"
        case .oneHour: return "1 heure"
        case .twentyFourHours: return "24 heures"
        }
    }

    public var expiresAt: Date {
        Date().addingTimeInterval(TimeInterval(rawValue))
    }
}
