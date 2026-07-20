import Foundation

/// Where the inspector is rendered. The unified timeline uses `.popover`
/// (floating over the tracks via `TimelineInspectorHost`); `.sheet` remains
/// for hosts that prefer a bottom-sheet presentation.
public enum InspectorPresentation: Sendable, Equatable {
    case sheet
    case popover
}
