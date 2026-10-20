import SwiftUI

public struct MeeshyIconButton: View {
    public let systemName: String
    public let label: String
    let glyphSize: CGFloat
    let weight: Font.Weight
    let action: () -> Void

    public init(
        systemName: String,
        label: String,
        glyphSize: CGFloat = MeeshyIconSize.lg,
        weight: Font.Weight = .semibold,
        action: @escaping () -> Void
    ) {
        self.systemName = systemName
        self.label = label
        self.glyphSize = glyphSize
        self.weight = weight
        self.action = action
    }

    public nonisolated static let minimumHitSide: CGFloat = MeeshyControlSize.tapTarget

    public nonisolated static func spokenLabel(_ label: String) -> String {
        label.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(MeeshyFont.relative(glyphSize, weight: weight))
                .accessibilityHidden(true)
                .meeshyTapTarget(Self.minimumHitSide)
        }
        .accessibilityLabel(Text(verbatim: Self.spokenLabel(label)))
    }
}
