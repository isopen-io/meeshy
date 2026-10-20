import SwiftUI

extension View {
    func cropAccessibility(label: String,
                           value: String,
                           onAdjust: @escaping (AccessibilityAdjustmentDirection) -> Void) -> some View {
        accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue(value)
            .accessibilityAdjustableAction(onAdjust)
    }
}

extension CropOverlayView {

    nonisolated static func accessibleHandles(aspectRatio: Double?) -> [CropOverlayHandle] {
        let corners: [CropOverlayHandle] = [.topLeft, .topRight, .bottomLeft, .bottomRight]
        let edges: [CropOverlayHandle] = [.top, .bottom, .left, .right]
        return corners + (aspectRatio == nil ? edges : []) + [.center]
    }

    static func handleLabel(_ handle: CropOverlayHandle) -> String {
        switch handle {
        case .topLeft: return String(localized: "media.crop.a11y.handle.topLeft", bundle: .module)
        case .topRight: return String(localized: "media.crop.a11y.handle.topRight", bundle: .module)
        case .bottomLeft: return String(localized: "media.crop.a11y.handle.bottomLeft", bundle: .module)
        case .bottomRight: return String(localized: "media.crop.a11y.handle.bottomRight", bundle: .module)
        case .top: return String(localized: "media.crop.a11y.handle.top", bundle: .module)
        case .bottom: return String(localized: "media.crop.a11y.handle.bottom", bundle: .module)
        case .left: return String(localized: "media.crop.a11y.handle.left", bundle: .module)
        case .right: return String(localized: "media.crop.a11y.handle.right", bundle: .module)
        case .center, .none: return String(localized: "media.crop.a11y.handle.frame", bundle: .module)
        }
    }

    static func moveLabel(_ move: CropFrameMove) -> String {
        switch move {
        case .left: return String(localized: "media.crop.a11y.move.left", bundle: .module)
        case .right: return String(localized: "media.crop.a11y.move.right", bundle: .module)
        case .up: return String(localized: "media.crop.a11y.move.up", bundle: .module)
        case .down: return String(localized: "media.crop.a11y.move.down", bundle: .module)
        }
    }

    func sizeValue() -> String {
        let shares = CropGeometry.percentages(cropRect, in: imageDisplayRect)
        return String(format: String(localized: "media.crop.a11y.size", bundle: .module),
                      MeeshyAccessibleValue.percent(shares.width),
                      MeeshyAccessibleValue.percent(shares.height))
    }

    func positionValue() -> String {
        let shares = CropGeometry.percentages(cropRect, in: imageDisplayRect)
        return String(format: String(localized: "media.crop.a11y.position", bundle: .module),
                      MeeshyAccessibleValue.percent(shares.x),
                      MeeshyAccessibleValue.percent(shares.y))
    }

    func handleValue(_ handle: CropOverlayHandle) -> String {
        handle == .center ? "\(sizeValue()). \(positionValue())" : sizeValue()
    }

    func applyAccessibilityStep(_ handle: CropOverlayHandle, _ direction: AccessibilityAdjustmentDirection) {
        guard let signed = MeeshyAdjustStep.signed(1, direction),
              let next = CropGeometry.stepped(cropRect, handle: handle, grow: signed > 0,
                                              aspectRatio: aspectRatio, bounds: imageDisplayRect,
                                              minSize: minCropSize) else { return }
        onInteraction()
        cropRect = next
    }

    func applyAccessibilityMove(_ move: CropFrameMove) {
        guard let next = CropGeometry.moved(cropRect, move: move, in: imageDisplayRect,
                                            minSize: minCropSize) else { return }
        onInteraction()
        cropRect = next
    }

    var cropFrameElement: some View {
        Color.clear
            .frame(width: cropRect.width, height: cropRect.height)
            .allowsHitTesting(false)
            .cropAccessibility(label: Self.handleLabel(.center), value: handleValue(.center)) { direction in
                applyAccessibilityStep(.center, direction)
            }
            .accessibilityActions {
                ForEach(CropFrameMove.allCases, id: \.self) { move in
                    Button(Self.moveLabel(move)) { applyAccessibilityMove(move) }
                }
            }
            .position(x: cropRect.midX, y: cropRect.midY)
    }
}
