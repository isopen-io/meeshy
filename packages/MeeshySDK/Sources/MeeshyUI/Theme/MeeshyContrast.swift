import SwiftUI

nonisolated public struct MeeshyContrast: Equatable, Sendable {
    public static let standard = MeeshyContrast(colorSchemeContrast: .standard, differentiateWithoutColor: false)

    private static let increasedOpacityFloor = 0.85

    public let isIncreased: Bool
    public let prefersNonColorCues: Bool

    public init(colorSchemeContrast: ColorSchemeContrast, differentiateWithoutColor: Bool) {
        self.isIncreased = colorSchemeContrast == .increased
        self.prefersNonColorCues = differentiateWithoutColor
    }

    public func foregroundOpacity(_ base: Double) -> Double {
        isIncreased ? max(base, Self.increasedOpacityFloor) : base
    }

    public var borderWidth: CGFloat {
        isIncreased ? 1 : 0
    }
}

@propertyWrapper
public struct ResolvedMeeshyContrast: DynamicProperty {
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

    public init() {}

    public var wrappedValue: MeeshyContrast {
        MeeshyContrast(
            colorSchemeContrast: colorSchemeContrast,
            differentiateWithoutColor: differentiateWithoutColor
        )
    }
}
