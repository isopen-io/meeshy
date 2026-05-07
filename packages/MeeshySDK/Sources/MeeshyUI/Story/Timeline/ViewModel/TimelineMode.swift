import Foundation

/// Two-way switch that selects which timeline UI is rendered.
///
/// `.quick` — portrait, ~3 visible tracks, mobile-first defaults
/// `.pro`   — landscape, multi-track CapCut-style, inspector floating
public enum TimelineMode: String, Codable, Sendable, CaseIterable {
    case quick
    case pro

    public nonisolated var toggled: TimelineMode {
        switch self {
        case .quick: return .pro
        case .pro:   return .quick
        }
    }

    public nonisolated var isPro: Bool { self == .pro }
}
