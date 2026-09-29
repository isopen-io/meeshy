import Foundation

// MARK: - Call Quality Grade

enum CallQualityGrade: Int, Comparable, Sendable {
    case good
    case medium
    case poor

    static func < (lhs: CallQualityGrade, rhs: CallQualityGrade) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var label: String {
        switch self {
        case .good: return String(localized: "call.quality.grade.good", defaultValue: "Bon", bundle: .main)
        case .medium: return String(localized: "call.quality.grade.medium", defaultValue: "Moyen", bundle: .main)
        case .poor: return String(localized: "call.quality.grade.poor", defaultValue: "Faible", bundle: .main)
        }
    }
}

// MARK: - Call Quality Metric

enum CallQualityMetric: String, CaseIterable, Sendable {
    case packetLoss
    case latency
    case jitter
    case audioRate
    case videoRate

    var title: String {
        switch self {
        case .packetLoss: return String(localized: "call.quality.loss", defaultValue: "Perte de paquets", bundle: .main)
        case .latency: return String(localized: "call.quality.latency", defaultValue: "Latence", bundle: .main)
        case .jitter: return String(localized: "call.quality.jitter", defaultValue: "Gigue", bundle: .main)
        case .audioRate: return String(localized: "call.quality.audioRate", defaultValue: "Débit audio", bundle: .main)
        case .videoRate: return String(localized: "call.quality.videoRate", defaultValue: "Débit vidéo", bundle: .main)
        }
    }
}

// MARK: - Call Quality Row

struct CallQualityRow: Equatable, Identifiable, Sendable {
    let metric: CallQualityMetric
    let value: String
    let grade: CallQualityGrade?

    var id: CallQualityMetric { metric }

    var accessibilityValue: String {
        [value, grade?.label].compactMap { $0 }.joined(separator: ", ")
    }
}

// MARK: - Call Quality Rows

enum CallQualityRows {
    static func rows(for reading: CallQualityReading?, locale: Locale) -> [CallQualityRow] {
        guard let reading else { return [] }
        return CallQualityMetric.allCases.map { metric in
            let raw = value(of: metric, in: reading)
            return CallQualityRow(
                metric: metric,
                value: formatted(raw, as: metric, locale: locale),
                grade: grade(for: metric, value: raw)
            )
        }
    }

    static func grade(for metric: CallQualityMetric, value: Double) -> CallQualityGrade? {
        switch metric {
        case .packetLoss: return ladder(value, medium: 3, poor: 5)
        case .latency: return ladder(value, medium: 300, poor: 450)
        case .jitter: return ladder(value, medium: 30, poor: 50)
        case .audioRate, .videoRate: return nil
        }
    }

    static func overall(_ rows: [CallQualityRow]) -> CallQualityGrade? {
        rows.compactMap(\.grade).max()
    }

    private static func ladder(_ value: Double, medium: Double, poor: Double) -> CallQualityGrade {
        if value >= poor { return .poor }
        if value >= medium { return .medium }
        return .good
    }

    private static func value(of metric: CallQualityMetric, in reading: CallQualityReading) -> Double {
        switch metric {
        case .packetLoss: return reading.packetLossPercent
        case .latency: return reading.roundTripTimeMs
        case .jitter: return reading.jitterMs
        case .audioRate: return reading.audioKbps
        case .videoRate: return reading.videoKbps
        }
    }

    private static func formatted(_ value: Double, as metric: CallQualityMetric, locale: Locale) -> String {
        switch metric {
        case .packetLoss:
            return (value / 100).formatted(.percent.precision(.fractionLength(0...1)).locale(locale))
        case .latency, .jitter:
            return Measurement(value: value.rounded(), unit: UnitDuration.milliseconds).formatted(
                .measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(0)))
                    .locale(locale)
            )
        case .audioRate, .videoRate:
            let number = value.rounded().formatted(.number.precision(.fractionLength(0)).locale(locale))
            return String(localized: "call.quality.rate.kbps", defaultValue: "\(number) kb/s", bundle: .main)
        }
    }
}

// MARK: - Call Quality Network Context

/// #8697 / #8698 — what the numbers alone do not say: which data profile caps
/// the call and whether the media rides a TURN relay or a direct path.
struct CallQualityNetworkContext: Equatable, Sendable {
    let profile: CallDataProfile?
    let relayed: Bool?

    static func from(_ reading: CallQualityReading?) -> CallQualityNetworkContext? {
        guard let reading, reading.profile != nil || reading.relayed != nil else { return nil }
        return CallQualityNetworkContext(profile: reading.profile, relayed: reading.relayed)
    }

    static var profileTitle: String {
        String(localized: "call.quality.profile", defaultValue: "Profil de données", bundle: .main)
    }

    static var routeTitle: String {
        String(localized: "call.quality.route", defaultValue: "Chemin réseau", bundle: .main)
    }

    var routeLabel: String? {
        relayed.map { isRelayed in
            isRelayed
                ? String(localized: "call.quality.route.relayed", defaultValue: "Relais", bundle: .main)
                : String(localized: "call.quality.route.direct", defaultValue: "Direct", bundle: .main)
        }
    }
}
