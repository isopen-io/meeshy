import SwiftUI

public struct SnapGuideView: View {

    /// Magenta — exception design vs brand indigo (see spec annex I).
    public static let snapColorHex = "EC4899"

    public let x: CGFloat
    public let height: CGFloat
    public let label: String
    public let isVisible: Bool
    public let reducedMotion: Bool

    public init(x: CGFloat, height: CGFloat, label: String, isVisible: Bool, reducedMotion: Bool) {
        self.x = x; self.height = height; self.label = label
        self.isVisible = isVisible; self.reducedMotion = reducedMotion
    }

    public var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(
                    Capsule().fill(Color(hex: Self.snapColorHex))
                )
                .accessibilityHidden(true)
            Rectangle()
                .fill(Color(hex: Self.snapColorHex))
                .frame(width: 1, height: height)
                .opacity(reducedMotion ? 1 : 0.95)
        }
        .frame(width: 80, height: height + 18, alignment: .top)
        .position(x: x, y: (height + 18) / 2)
        .opacity(isVisible ? 1 : 0)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}
