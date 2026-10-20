import SwiftUI

// MARK: - Meeshy Dashes Shape

nonisolated public struct MeeshyDashesShape: Shape {
    public let dashIndex: Int

    public init(dashIndex: Int) {
        self.dashIndex = dashIndex
    }

    public func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 1024.0
        let xOffset = (rect.width - (1024 * scale)) / 2
        let yOffset = (rect.height - (1024 * scale)) / 2

        var path = Path()

        if dashIndex == 0 {
            path.move(to: CGPoint(x: 262, y: 384))
            path.addLine(to: CGPoint(x: 762, y: 384))
        } else if dashIndex == 1 {
            path.move(to: CGPoint(x: 262, y: 512))
            path.addLine(to: CGPoint(x: 662, y: 512))
        } else if dashIndex == 2 {
            path.move(to: CGPoint(x: 262, y: 640))
            path.addLine(to: CGPoint(x: 562, y: 640))
        }

        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale)
                .concatenating(CGAffineTransform(translationX: xOffset, y: yOffset))
        )
    }
}

// MARK: - Animated Logo View

public struct AnimatedLogoView: View {
    @State private var showDash1 = false
    @State private var showDash2 = false
    @State private var showDash3 = false
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public var color: Color = .white
    public var lineWidth: CGFloat = 8
    public var continuous: Bool = false

    public init(color: Color = .white, lineWidth: CGFloat = 8, continuous: Bool = false) {
        self.color = color; self.lineWidth = lineWidth; self.continuous = continuous
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    nonisolated static func breathes(continuous: Bool, reduceMotion: Bool) -> Bool {
        continuous && !reduceMotion
    }

    nonisolated static func dashAnimation(delay: Double, reduceMotion: Bool) -> Animation? {
        MeeshyMotion.animation(.easeOut(duration: 0.25).delay(delay), reduce: reduceMotion)
    }

    public var body: some View {
        let breathing = breathe && !reduceMotion
        return ZStack {
            MeeshyDashesShape(dashIndex: 0)
                .trim(from: 0, to: showDash1 ? 1 : 0)
                .stroke(color.opacity(breathing ? 1.0 : 0.7), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(Self.dashAnimation(delay: 0, reduceMotion: reduceMotion), value: showDash1)

            MeeshyDashesShape(dashIndex: 1)
                .trim(from: 0, to: showDash2 ? 1 : 0)
                .stroke(color.opacity(breathing ? 0.85 : 1.0), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(Self.dashAnimation(delay: 0.1, reduceMotion: reduceMotion), value: showDash2)

            MeeshyDashesShape(dashIndex: 2)
                .trim(from: 0, to: showDash3 ? 1 : 0)
                .stroke(color.opacity(breathing ? 1.0 : 0.75), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(Self.dashAnimation(delay: 0.2, reduceMotion: reduceMotion), value: showDash3)
        }
        .aspectRatio(1, contentMode: .fit)
        .scaleEffect(breathing ? 1.05 : 1.0)
        .onAppear {
            showDash1 = true; showDash2 = true; showDash3 = true
            if Self.breathes(continuous: continuous, reduceMotion: reduceMotion) {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    breathe = true
                }
            }
        }
        .adaptiveOnChange(of: reduceMotion) { _, reduce in
            guard reduce else { return }
            withTransaction(Transaction(animation: nil)) {
                breathe = false
            }
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                breathe = false
            }
        }
    }
}
