import SwiftUI

nonisolated public enum MeeshyPointerShape: Shape, Equatable, Sendable {
    case roundedRect(cornerRadius: CGFloat)
    case capsule
    case circle

    public func path(in rect: CGRect) -> Path {
        switch self {
        case .roundedRect(let cornerRadius):
            return RoundedRectangle(cornerRadius: max(0, cornerRadius), style: .continuous).path(in: rect)
        case .capsule:
            return Capsule(style: .continuous).path(in: rect)
        case .circle:
            return Circle().path(in: rect)
        }
    }
}

extension View {
    public func meeshyPointerInteractive(shape: MeeshyPointerShape = .roundedRect(cornerRadius: 12)) -> some View {
        contentShape(.hoverEffect, shape).hoverEffect(.highlight)
    }

    @ViewBuilder
    public func meeshyColumnResizePointer() -> some View {
        #if os(visionOS) || os(macOS)
        pointerStyle(.columnResize)
        #else
        hoverEffect(.highlight)
        #endif
    }
}

public struct MeeshyPointerButtonStyle: ButtonStyle {
    private let shape: MeeshyPointerShape

    public init(shape: MeeshyPointerShape = .roundedRect(cornerRadius: 12)) {
        self.shape = shape
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .meeshyPointerInteractive(shape: shape)
    }
}
