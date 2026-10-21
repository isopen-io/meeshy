import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Crop Overlay View

/// Interactive crop frame with corner + edge handles. Aspect-ratio aware:
/// when `aspectRatio` is set, edge handles are hidden and corners resize
/// proportionally.
struct CropOverlayView: View {
    @Binding var cropRect: CGRect
    let imageDisplayRect: CGRect
    let aspectRatio: Double?
    let image: UIImage
    /// Fired once when the user first grabs a handle — lets the host know the
    /// crop frame was deliberately engaged.
    var onInteraction: () -> Void = {}

    private let handleSize: CGFloat = 24
    private let handleHitArea: CGFloat = MeeshyControlSize.tapTarget
    let minCropSize: CGFloat = 56

    @State private var isDragging = false
    @State private var activeHandle: CropHandle = .none
    @State private var lastTranslation: CGSize = .zero

    typealias CropHandle = CropOverlayHandle

    var body: some View {
        ZStack {
            GeometryReader { geo in
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: geo.size))
                    path.addRect(cropRect)
                }
                .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: imageDisplayRect.width, height: imageDisplayRect.height)
                .position(x: imageDisplayRect.midX, y: imageDisplayRect.midY)
                .mask(
                    Rectangle()
                        .frame(width: cropRect.width, height: cropRect.height)
                        .position(x: cropRect.midX, y: cropRect.midY)
                )
                .accessibilityHidden(true)

            CropFrameView(rect: cropRect)
                .accessibilityHidden(true)
            cropFrameElement
            cropHandles
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if !isDragging {
                        activeHandle = detectHandle(at: value.startLocation)
                        isDragging = true
                        lastTranslation = .zero
                        if activeHandle != .none { onInteraction() }
                    }
                    let delta = CGSize(
                        width: value.translation.width - lastTranslation.width,
                        height: value.translation.height - lastTranslation.height
                    )
                    lastTranslation = value.translation
                    updateCropRect(with: delta, handle: activeHandle)
                }
                .onEnded { _ in
                    isDragging = false
                    activeHandle = .none
                    lastTranslation = .zero
                    constrainCropRect()
                }
        )
    }

    private var cropHandles: some View {
        ZStack {
            cornerHandle(at: .topLeft)
            cornerHandle(at: .topRight)
            cornerHandle(at: .bottomLeft)
            cornerHandle(at: .bottomRight)

            if aspectRatio == nil {
                edgeHandle(at: .top)
                edgeHandle(at: .bottom)
                edgeHandle(at: .left)
                edgeHandle(at: .right)
            }
        }
    }

    private func cornerHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .topLeft: CGPoint(x: cropRect.minX, y: cropRect.minY)
        case .topRight: CGPoint(x: cropRect.maxX, y: cropRect.minY)
        case .bottomLeft: CGPoint(x: cropRect.minX, y: cropRect.maxY)
        case .bottomRight: CGPoint(x: cropRect.maxX, y: cropRect.maxY)
        default: .zero
        }

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            CornerHandleShape(corner: handle)
                .stroke(Color.white, lineWidth: 3)
                .frame(width: handleSize, height: handleSize)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .cropAccessibility(label: Self.handleLabel(handle), value: handleValue(handle)) { direction in
            applyAccessibilityStep(handle, direction)
        }
        .position(position)
    }

    private func edgeHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .top: CGPoint(x: cropRect.midX, y: cropRect.minY)
        case .bottom: CGPoint(x: cropRect.midX, y: cropRect.maxY)
        case .left: CGPoint(x: cropRect.minX, y: cropRect.midY)
        case .right: CGPoint(x: cropRect.maxX, y: cropRect.midY)
        default: .zero
        }

        let isHorizontal = handle == .top || handle == .bottom

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white)
                .frame(width: isHorizontal ? 30 : 4, height: isHorizontal ? 4 : 30)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .cropAccessibility(label: Self.handleLabel(handle), value: handleValue(handle)) { direction in
            applyAccessibilityStep(handle, direction)
        }
        .position(position)
    }

    private func detectHandle(at point: CGPoint) -> CropHandle {
        let threshold = handleHitArea / 2

        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.minY)) < threshold { return .topLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.minY)) < threshold { return .topRight }
        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.maxY)) < threshold { return .bottomLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.maxY)) < threshold { return .bottomRight }

        if aspectRatio == nil {
            if abs(point.y - cropRect.minY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .top }
            if abs(point.y - cropRect.maxY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .bottom }
            if abs(point.x - cropRect.minX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .left }
            if abs(point.x - cropRect.maxX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .right }
        }

        if cropRect.contains(point) { return .center }
        return .none
    }

    private func distance(from p1: CGPoint, to p2: CGPoint) -> CGFloat {
        sqrt(pow(p1.x - p2.x, 2) + pow(p1.y - p2.y, 2))
    }

    private func updateCropRect(with translation: CGSize, handle: CropHandle) {
        let next = CropGeometry.resized(cropRect, handle: handle, translation: translation,
                                        aspectRatio: aspectRatio, minSize: minCropSize)
        guard next != cropRect else { return }
        cropRect = next
    }

    private func constrainCropRect() {
        let constrained = CropGeometry.constrained(cropRect, to: imageDisplayRect, minSize: minCropSize)
        withAnimation(.easeOut(duration: 0.2)) {
            cropRect = constrained
        }
    }
}

// MARK: - Crop Frame View

private struct CropFrameView: View {
    let rect: CGRect

    var body: some View {
        ZStack {
            Rectangle()
                .stroke(Color.white, lineWidth: MeeshyBorder.emphasis)
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .shadow(color: .black.opacity(0.3), radius: 2)

            GridLinesView()
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
        }
    }
}

// MARK: - Grid Lines View

private struct GridLinesView: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: geo.size.width / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width / 3, y: geo.size.height))
                    path.move(to: CGPoint(x: geo.size.width * 2 / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width * 2 / 3, y: geo.size.height))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: MeeshyBorder.hairline)

                Path { path in
                    path.move(to: CGPoint(x: 0, y: geo.size.height / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 3))
                    path.move(to: CGPoint(x: 0, y: geo.size.height * 2 / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height * 2 / 3))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: MeeshyBorder.hairline)
            }
        }
    }
}

// MARK: - Corner Handle Shape

nonisolated private struct CornerHandleShape: Shape {
    let corner: CropOverlayView.CropHandle

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = rect.width * 0.6

        switch corner {
        case .topLeft:
            path.move(to: CGPoint(x: 0, y: length))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: length, y: 0))
        case .topRight:
            path.move(to: CGPoint(x: rect.width - length, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: length))
        case .bottomLeft:
            path.move(to: CGPoint(x: 0, y: rect.height - length))
            path.addLine(to: CGPoint(x: 0, y: rect.height))
            path.addLine(to: CGPoint(x: length, y: rect.height))
        case .bottomRight:
            path.move(to: CGPoint(x: rect.width, y: rect.height - length))
            path.addLine(to: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: rect.width - length, y: rect.height))
        default:
            break
        }

        return path
    }
}
