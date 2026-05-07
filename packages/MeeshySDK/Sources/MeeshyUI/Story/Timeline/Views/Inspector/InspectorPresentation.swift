import Foundation

/// Where the inspector is rendered. Quick Mode uses a bottom sheet; Pro Mode
/// pins it as a floating popover anchored bottom-leading next to the canvas.
public enum InspectorPresentation: Sendable, Equatable {
    case sheet
    case popover
}
