import SwiftUI

public struct MeeshyPointerPlainButtonStyle: ButtonStyle {
    private let shape: MeeshyPointerShape

    public init(shape: MeeshyPointerShape = .roundedRect(cornerRadius: MeeshyRadius.smPlus)) {
        self.shape = shape
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label.meeshyPointerInteractive(shape: shape)
    }
}
