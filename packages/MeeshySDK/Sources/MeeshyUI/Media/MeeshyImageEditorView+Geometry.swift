import MeeshySDK
import SwiftUI
import UIKit

extension MeeshyImageEditorView {
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
}
