import SwiftUI

public struct DurationHandle: View {

    public let duration: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isDark: Bool
    public let minDuration: Float
    public let maxDuration: Float
    public let onChange: (Float) -> Void

    public init(duration: Float, geometry: TimelineGeometry, laneHeight: CGFloat,
                isDark: Bool, minDuration: Float = 2, maxDuration: Float = 600,
                onChange: @escaping (Float) -> Void) {
        self.duration = duration; self.geometry = geometry
        self.laneHeight = laneHeight; self.isDark = isDark
        self.minDuration = minDuration; self.maxDuration = maxDuration
        self.onChange = onChange
    }

    public static func clamp(_ value: Float, min minV: Float, max maxV: Float) -> Float {
        Swift.max(minV, Swift.min(value, maxV))
    }

    /// Ancre du drag en cours : la durée est capturée UNE fois au premier
    /// `onChanged` — la translation de DragGesture est CUMULÉE, la rajouter à
    /// la prop `duration` (déjà mutée à chaque frame) composait
    /// quadratiquement (pattern boule-de-neige des drags de clips).
    @State private var dragAnchor: Float?

    public var body: some View {
        let x = geometry.x(for: duration)
        DiamondShape()
            .fill(MeeshyColors.indigo500)
            .overlay(DiamondShape().stroke(MeeshyColors.indigo700, lineWidth: 1))
            .shadow(color: MeeshyColors.indigo500.opacity(0.55), radius: 4)
            .frame(width: 16, height: 16)
            .contentShape(Rectangle().inset(by: -16))
            .position(x: x, y: laneHeight / 2)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        let anchor = dragAnchor ?? duration
                        if dragAnchor == nil { dragAnchor = anchor }
                        let newDur = anchor + Float(v.translation.width / geometry.pixelsPerSecond)
                        onChange(Self.clamp(newDur, min: minDuration, max: maxDuration))
                    }
                    .onEnded { _ in dragAnchor = nil }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "story.timeline.a11y.durationHandle", bundle: .module))
            .accessibilityValue(String(format: "%.1fs", duration))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: onChange(Self.clamp(duration + 0.5, min: minDuration, max: maxDuration))
                case .decrement: onChange(Self.clamp(duration - 0.5, min: minDuration, max: maxDuration))
                @unknown default: break
                }
            }
    }
}

private struct DiamondShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
