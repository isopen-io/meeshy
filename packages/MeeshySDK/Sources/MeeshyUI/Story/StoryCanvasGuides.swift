import SwiftUI
import MeeshySDK

// MARK: - Shared style

extension StrokeStyle {
    /// Canonical dashed border for story-canvas indicators (safe zone, zoom hint, etc.).
    static let storyDashed = StrokeStyle(lineWidth: 1, dash: [4, 4])
}

// MARK: - Safe Zone

enum StorySafeZone {
    /// Top inset accounts for viewer progress bars + header + Dynamic Island (~18% of canvas height).
    static let topInset: CGFloat = 0.18
    /// Bottom inset accounts for viewer reply bar + gradient scrim + actions (~25% of canvas height).
    static let bottomInset: CGFloat = 0.25
    static let horizontalInset: CGFloat = 0.05

    static let normalizedRect: CGRect = CGRect(
        x: horizontalInset,
        y: topInset,
        width: 1.0 - 2 * horizontalInset,
        height: 1.0 - topInset - bottomInset
    )

    static func denormalizedRect(in size: CGSize) -> CGRect {
        CGRect(
            x: normalizedRect.minX * size.width,
            y: normalizedRect.minY * size.height,
            width: normalizedRect.width * size.width,
            height: normalizedRect.height * size.height
        )
    }

    static func isOutOfBounds(_ rect: CGRect) -> Bool {
        let safe = normalizedRect
        return rect.minX < safe.minX
            || rect.minY < safe.minY
            || rect.maxX > safe.maxX
            || rect.maxY > safe.maxY
    }
}

// MARK: - Alignment Snap

enum StoryAlignmentSnap {
    /// ~6pt on a 393pt canvas — small enough to feel intentional, large enough to catch.
    static let snapTolerance: CGFloat = 0.015

    static let horizontalTargets: [CGFloat] = [
        StorySafeZone.normalizedRect.minX,
        1.0 / 3.0,
        0.5,
        2.0 / 3.0,
        StorySafeZone.normalizedRect.maxX
    ]

    static let verticalTargets: [CGFloat] = [
        StorySafeZone.normalizedRect.minY,
        1.0 / 3.0,
        0.5,
        2.0 / 3.0,
        StorySafeZone.normalizedRect.maxY
    ]

    static func snappedX(for x: CGFloat) -> CGFloat? {
        horizontalTargets.first { abs($0 - x) <= snapTolerance }
    }

    static func snappedY(for y: CGFloat) -> CGFloat? {
        verticalTargets.first { abs($0 - y) <= snapTolerance }
    }

    static func apply(to point: CGPoint) -> CGPoint {
        CGPoint(
            x: snappedX(for: point.x) ?? point.x,
            y: snappedY(for: point.y) ?? point.y
        )
    }
}

// MARK: - Safe Zone Overlay

struct SafeZoneOverlay: View {
    let canvasSize: CGSize
    let isDragging: Bool

    var body: some View {
        let rect = StorySafeZone.denormalizedRect(in: canvasSize)

        ZStack {
            if isDragging {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(style: .storyDashed)
                    .foregroundStyle(MeeshyColors.indigo300.opacity(0.7))
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)

                Text("Safe area")
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.85)))
                    .position(x: rect.midX, y: rect.minY - 10)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isDragging)
        .allowsHitTesting(false)
    }
}

// MARK: - Alignment Guides Overlay

struct AlignmentGuidesOverlay: View {
    let canvasSize: CGSize
    let dragPosition: CGPoint

    var body: some View {
        ZStack {
            ForEach(activeTargets(StoryAlignmentSnap.horizontalTargets, near: dragPosition.x), id: \.self) { target in
                Rectangle()
                    .fill(guideColor(target: target))
                    .frame(width: 1, height: canvasSize.height)
                    .position(x: target * canvasSize.width, y: canvasSize.height / 2)
            }
            ForEach(activeTargets(StoryAlignmentSnap.verticalTargets, near: dragPosition.y), id: \.self) { target in
                Rectangle()
                    .fill(guideColor(target: target))
                    .frame(width: canvasSize.width, height: 1)
                    .position(x: canvasSize.width / 2, y: target * canvasSize.height)
            }
        }
        .allowsHitTesting(false)
        .animation(.easeInOut(duration: 0.12), value: dragPosition)
    }

    private func activeTargets(_ targets: [CGFloat], near value: CGFloat) -> [CGFloat] {
        targets.filter { abs($0 - value) <= StoryAlignmentSnap.snapTolerance }
    }

    private func guideColor(target: CGFloat) -> Color {
        target == 0.5 ? MeeshyColors.indigo500.opacity(0.9)
                      : MeeshyColors.indigo300.opacity(0.6)
    }
}

// MARK: - Out-Of-Bounds Warning

struct OutOfBoundsWarningOverlay: View {
    let canvasSize: CGSize
    let isOutOfBounds: Bool

    @State private var pulse: Bool = false

    var body: some View {
        let rect = StorySafeZone.denormalizedRect(in: canvasSize)

        ZStack {
            if isOutOfBounds {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(
                        Color.red.opacity(pulse ? 0.9 : 0.5),
                        lineWidth: pulse ? 2.5 : 1.5
                    )
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
                    .onAppear { pulse = true }
                    .animation(
                        .easeInOut(duration: 0.6).repeatForever(autoreverses: true),
                        value: pulse
                    )
                    .transition(.opacity)

                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("Hors zone visible")
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(Color.red.opacity(0.9))
                        .shadow(color: .black.opacity(0.3), radius: 3)
                )
                .position(x: rect.midX, y: rect.maxY + 12)
                .transition(.opacity.combined(with: .scale))
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Filter overlay (shared composer + reader)

/// Applique un blend SwiftUI correspondant a un `StoryFilter` avec intensite. Utilise
/// par le reader (lecture seule) ET par le composer pour garantir un rendu
/// pixel-identique entre les deux modes — auparavant le composer n'appliquait le
/// filtre qu'au `selectedImage` legacy, donc une story avec media de fond + filtre
/// montrait un canvas non-filtre dans le composer mais filtre dans le viewer.
struct StoryFilterOverlayView: View {
    let filter: StoryFilter
    let intensity: Double

    var body: some View {
        switch filter {
        case .vintage:
            Color.orange.opacity(0.15 * intensity).blendMode(.multiply)
        case .bw:
            Color.gray.opacity(0.001)
                .saturation(1.0 - intensity)
        case .warm:
            Color.orange.opacity(0.08 * intensity).blendMode(.softLight)
        case .cool:
            Color.blue.opacity(0.08 * intensity).blendMode(.softLight)
        case .dramatic:
            Color.black.opacity(0.2 * intensity).blendMode(.multiply)
        case .vivid:
            Color.clear.saturation(1.0 + 0.5 * intensity)
        case .fade:
            Color.white.opacity(0.15 * intensity).blendMode(.lighten)
        case .chrome:
            Color.clear.contrast(1.0 + 0.3 * intensity)
        }
    }
}
