import SwiftUI

public struct RulerView: View {

    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let isDark: Bool
    public let height: CGFloat
    public let onTapTime: (Float) -> Void

    public init(
        totalDuration: Float,
        geometry: TimelineGeometry,
        isDark: Bool,
        height: CGFloat = 24,
        onTapTime: @escaping (Float) -> Void
    ) {
        self.totalDuration = totalDuration
        self.geometry = geometry
        self.isDark = isDark
        self.height = height
        self.onTapTime = onTapTime
    }

    public static func tickInterval(for zoom: CGFloat) -> Double {
        let pps = Double(TimelineGeometry.basePixelsPerSecond * zoom)
        switch pps {
        case ..<20:    return 5.0
        case 20..<40:  return 2.0
        case 40..<80:  return 1.0
        case 80..<500: return 0.2
        default:       return 0.05
        }
    }

    public static func formatTick(_ seconds: Double) -> String {
        if seconds < 1.0 {
            return "\(Int((seconds * 1000).rounded()))ms"
        } else if seconds < 60.0 {
            let rounded = (seconds * 10).rounded() / 10
            if rounded == rounded.rounded() {
                return "\(Int(rounded))s"
            }
            return String(format: "%.1fs", rounded)
        } else {
            let m = Int(seconds) / 60
            let s = Int(seconds) % 60
            return String(format: "%d:%02d", m, s)
        }
    }

    public var body: some View {
        let interval = Self.tickInterval(for: geometry.zoomScale)
        let count = max(1, Int((Double(totalDuration) / interval).rounded(.up)) + 1)

        ZStack(alignment: .leading) {
            Rectangle()
                .fill(isDark ? Color.black.opacity(0.4) : Color.white.opacity(0.7))
            ForEach(0..<count, id: \.self) { i in
                let t = Double(i) * interval
                tick(at: CGFloat(t) * geometry.pixelsPerSecond, label: Self.formatTick(t))
            }
        }
        .frame(height: height)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in onTapTime(geometry.time(forX: max(0, v.location.x))) }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Ruler")
    }

    private func tick(at x: CGFloat, label: String) -> some View {
        VStack(spacing: 2) {
            Rectangle()
                .fill(isDark ? MeeshyColors.indigo300.opacity(0.7) : MeeshyColors.indigo700.opacity(0.6))
                .frame(width: 1, height: 6)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo800)
                .lineLimit(1)
                .fixedSize()
        }
        .position(x: x, y: height / 2)
    }
}
