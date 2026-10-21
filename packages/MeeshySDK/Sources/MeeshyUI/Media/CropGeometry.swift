import CoreGraphics

nonisolated enum CropOverlayHandle: CaseIterable, Sendable {
    case none
    case topLeft, topRight, bottomLeft, bottomRight
    case top, bottom, left, right
    case center
}

nonisolated struct CropPercentages: Equatable, Sendable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

nonisolated enum CropFrameMove: CaseIterable, Sendable {
    case left, right, up, down

    var unit: CGSize {
        switch self {
        case .left: return CGSize(width: -1, height: 0)
        case .right: return CGSize(width: 1, height: 0)
        case .up: return CGSize(width: 0, height: -1)
        case .down: return CGSize(width: 0, height: 1)
        }
    }
}

nonisolated enum CropGeometry {

    static func resized(_ rect: CGRect,
                        handle: CropOverlayHandle,
                        translation: CGSize,
                        aspectRatio: Double?,
                        minSize: CGFloat) -> CGRect {
        guard handle != .none else { return rect }
        var next = rect
        switch handle {
        case .none:
            return rect
        case .center:
            next.origin.x += translation.width
            next.origin.y += translation.height
        case .topLeft:
            if let ratio = aspectRatio {
                let diagonal = min(translation.width, translation.height)
                next.origin.x += diagonal
                next.origin.y += diagonal / ratio
                next.size.width -= diagonal
                next.size.height -= diagonal / ratio
            } else {
                next.origin.x += translation.width
                next.origin.y += translation.height
                next.size.width -= translation.width
                next.size.height -= translation.height
            }
        case .topRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, -translation.height)
                next.origin.y -= change / ratio
                next.size.width += change
                next.size.height += change / ratio
            } else {
                next.origin.y += translation.height
                next.size.width += translation.width
                next.size.height -= translation.height
            }
        case .bottomLeft:
            if let ratio = aspectRatio {
                let change = max(-translation.width, translation.height)
                next.origin.x -= change
                next.size.width += change
                next.size.height += change / ratio
            } else {
                next.origin.x += translation.width
                next.size.width -= translation.width
                next.size.height += translation.height
            }
        case .bottomRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, translation.height)
                next.size.width += change
                next.size.height += change / ratio
            } else {
                next.size.width += translation.width
                next.size.height += translation.height
            }
        case .top:
            next.origin.y += translation.height
            next.size.height -= translation.height
        case .bottom:
            next.size.height += translation.height
        case .left:
            next.origin.x += translation.width
            next.size.width -= translation.width
        case .right:
            next.size.width += translation.width
        }
        return next.width >= minSize && next.height >= minSize ? next : rect
    }

    static func constrained(_ rect: CGRect, to bounds: CGRect, minSize: CGFloat) -> CGRect {
        var fitted = rect
        fitted.size.width = max(minSize, min(fitted.width, bounds.width))
        fitted.size.height = max(minSize, min(fitted.height, bounds.height))
        fitted.origin.x = max(bounds.minX, min(fitted.origin.x, bounds.maxX - fitted.width))
        fitted.origin.y = max(bounds.minY, min(fitted.origin.y, bounds.maxY - fitted.height))
        return fitted
    }

    static func step(in bounds: CGRect) -> CGSize {
        CGSize(width: bounds.width * MeeshyAdjustStep.fraction,
               height: bounds.height * MeeshyAdjustStep.fraction)
    }

    static func outward(_ handle: CropOverlayHandle, step: CGSize) -> CGSize {
        switch handle {
        case .none, .center: return .zero
        case .topLeft: return CGSize(width: -step.width, height: -step.height)
        case .topRight: return CGSize(width: step.width, height: -step.height)
        case .bottomLeft: return CGSize(width: -step.width, height: step.height)
        case .bottomRight: return CGSize(width: step.width, height: step.height)
        case .top: return CGSize(width: 0, height: -step.height)
        case .bottom: return CGSize(width: 0, height: step.height)
        case .left: return CGSize(width: -step.width, height: 0)
        case .right: return CGSize(width: step.width, height: 0)
        }
    }

    static func scaledUniformly(_ rect: CGRect,
                                step: CGSize,
                                aspectRatio: Double?,
                                grow: Bool,
                                minSize: CGFloat) -> CGRect {
        guard rect.height > 0 else { return rect }
        let ratio = aspectRatio.map { CGFloat($0) } ?? rect.width / rect.height
        let width = rect.width + (grow ? 2 : -2) * step.width
        let height = width / ratio
        guard width >= minSize, height >= minSize else { return rect }
        return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
    }

    static func contained(_ rect: CGRect, in bounds: CGRect, keepsRatio: Bool) -> CGRect? {
        if bounds.contains(rect) { return rect }
        return keepsRatio ? nil : rect.intersection(bounds)
    }

    static func percentages(_ rect: CGRect, in image: CGRect) -> CropPercentages {
        guard image.width > 0, image.height > 0 else {
            return CropPercentages(x: 0, y: 0, width: 0, height: 0)
        }
        return CropPercentages(
            x: Double((rect.minX - image.minX) / image.width),
            y: Double((rect.minY - image.minY) / image.height),
            width: Double(rect.width / image.width),
            height: Double(rect.height / image.height)
        )
    }

    static func stepped(_ rect: CGRect,
                        handle: CropOverlayHandle,
                        grow: Bool,
                        aspectRatio: Double?,
                        bounds: CGRect,
                        minSize: CGFloat) -> CGRect? {
        let unit = step(in: bounds)
        let candidate: CGRect
        if handle == .center {
            candidate = scaledUniformly(rect, step: unit, aspectRatio: aspectRatio, grow: grow, minSize: minSize)
        } else {
            let sign: CGFloat = grow ? 1 : -1
            let direction = outward(handle, step: unit)
            candidate = resized(rect, handle: handle,
                                translation: CGSize(width: direction.width * sign, height: direction.height * sign),
                                aspectRatio: aspectRatio, minSize: minSize)
        }
        let keepsRatio = aspectRatio != nil || handle == .center
        guard let fitted = contained(candidate, in: bounds, keepsRatio: keepsRatio),
              fitted != rect,
              fitted.width >= minSize, fitted.height >= minSize else { return nil }
        return fitted
    }

    static func moved(_ rect: CGRect, move: CropFrameMove, in bounds: CGRect, minSize: CGFloat) -> CGRect? {
        let unit = step(in: bounds)
        let shifted = rect.offsetBy(dx: move.unit.width * unit.width, dy: move.unit.height * unit.height)
        let fitted = constrained(shifted, to: bounds, minSize: minSize)
        return fitted == rect ? nil : fitted
    }
}
