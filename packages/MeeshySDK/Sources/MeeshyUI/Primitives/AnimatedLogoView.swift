import SwiftUI

// MARK: - Meeshy Dashes Shape

public struct MeeshyDashesShape: Shape {
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

    public var color: Color = .white
    public var lineWidth: CGFloat = 8
    public var continuous: Bool = false

    public init(color: Color = .white, lineWidth: CGFloat = 8, continuous: Bool = false) {
        self.color = color; self.lineWidth = lineWidth; self.continuous = continuous
    }

    public var body: some View {
        ZStack {
            MeeshyDashesShape(dashIndex: 0)
                .trim(from: 0, to: showDash1 ? 1 : 0)
                .stroke(color.opacity(breathe ? 1.0 : 0.7), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4), value: showDash1)

            MeeshyDashesShape(dashIndex: 1)
                .trim(from: 0, to: showDash2 ? 1 : 0)
                .stroke(color.opacity(breathe ? 0.85 : 1.0), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4).delay(0.2), value: showDash2)

            MeeshyDashesShape(dashIndex: 2)
                .trim(from: 0, to: showDash3 ? 1 : 0)
                .stroke(color.opacity(breathe ? 1.0 : 0.75), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .animation(.easeOut(duration: 0.4).delay(0.4), value: showDash3)
        }
        .aspectRatio(1, contentMode: .fit)
        .scaleEffect(breathe ? 1.05 : 1.0)
        .onAppear {
            showDash1 = true; showDash2 = true; showDash3 = true
            if continuous {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    breathe = true
                }
            }
        }
        .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: breathe)
    }
}
