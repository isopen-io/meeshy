import Foundation

public nonisolated enum MeeshySurface: Equatable, Sendable {
    case translucent
    case opaque

    public func resolved(reduceTransparency: Bool) -> MeeshySurface {
        guard reduceTransparency else { return self }
        return .opaque
    }
}
