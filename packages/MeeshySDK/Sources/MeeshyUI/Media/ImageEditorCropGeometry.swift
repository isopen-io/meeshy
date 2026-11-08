import CoreGraphics

nonisolated enum ImageEditorBakedCrop: Equatable, Sendable {
    case fullFrame
    case region(CGRect)
}

nonisolated enum ImageEditorCropGeometry {

    static func fittedRect(for imageSize: CGSize, in container: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0,
              container.width > 0, container.height > 0 else {
            return CGRect(x: 0, y: 0, width: max(container.width, 1), height: max(container.height, 1))
        }
        let imageAspect = imageSize.width / imageSize.height
        let containerAspect = container.width / container.height
        let size: CGSize
        if imageAspect > containerAspect {
            size = CGSize(width: container.width, height: container.width / imageAspect)
        } else {
            size = CGSize(width: container.height * imageAspect, height: container.height)
        }
        return CGRect(
            x: (container.width - size.width) / 2,
            y: (container.height - size.height) / 2,
            width: size.width,
            height: size.height
        )
    }

    static func centeredRect(aspect ratio: Double, in bounds: CGRect, fill: CGFloat) -> CGRect {
        let maxWidth = bounds.width * fill
        let maxHeight = bounds.height * fill
        let width: CGFloat
        let height: CGFloat
        if maxWidth / ratio <= maxHeight {
            width = maxWidth
            height = maxWidth / ratio
        } else {
            height = maxHeight
            width = maxHeight * ratio
        }
        return CGRect(
            x: bounds.midX - width / 2,
            y: bounds.midY - height / 2,
            width: width,
            height: height
        )
    }

    static func initialCrop(normalized: CGRect?, ratio: Double?, in displayRect: CGRect) -> CGRect {
        if let norm = normalized {
            return CGRect(
                x: displayRect.minX + norm.minX * displayRect.width,
                y: displayRect.minY + norm.minY * displayRect.height,
                width: norm.width * displayRect.width,
                height: norm.height * displayRect.height
            )
        }
        if let ratio {
            return centeredRect(aspect: ratio, in: displayRect, fill: 0.92)
        }
        return displayRect
    }

    static func crop(_ cropRect: CGRect, adjustedTo ratio: Double?, in displayRect: CGRect) -> CGRect? {
        guard displayRect.width > 1, displayRect.height > 1 else { return nil }
        guard let ratio else {
            return cropRect.width < 40 || cropRect.height < 40 ? displayRect : nil
        }
        let centerX = cropRect.midX
        let centerY = cropRect.midY
        let maxWidth = min(cropRect.width, displayRect.width * 0.95)
        let maxHeight = min(cropRect.height, displayRect.height * 0.95)
        let width: CGFloat
        let height: CGFloat
        if maxWidth / ratio <= maxHeight {
            width = maxWidth
            height = maxWidth / ratio
        } else {
            height = maxHeight
            width = maxHeight * ratio
        }
        let proposed = CGRect(
            x: centerX - width / 2,
            y: centerY - height / 2,
            width: width,
            height: height
        )
        return proposed.intersection(displayRect)
    }

    static func bake(cropRect: CGRect, in displayRect: CGRect) -> ImageEditorBakedCrop? {
        guard displayRect.width > 1, displayRect.height > 1,
              cropRect.width > 1, cropRect.height > 1 else { return nil }

        let raw = CGRect(
            x: (cropRect.minX - displayRect.minX) / displayRect.width,
            y: (cropRect.minY - displayRect.minY) / displayRect.height,
            width: cropRect.width / displayRect.width,
            height: cropRect.height / displayRect.height
        )
        let normalized = raw.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard normalized.width > 0.02, normalized.height > 0.02 else { return nil }

        let isFullFrame = normalized.minX < 0.006 && normalized.minY < 0.006
            && normalized.width > 0.988 && normalized.height > 0.988
        return isFullFrame ? .fullFrame : .region(normalized)
    }
}
