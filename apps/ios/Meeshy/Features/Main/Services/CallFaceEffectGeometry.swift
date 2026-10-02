import CoreGraphics
import Foundation
import ImageIO

nonisolated struct CallFaceLandmarks: Equatable, Sendable {
    let bounds: CGRect
    let leftEye: CGPoint?
    let rightEye: CGPoint?

    init(bounds: CGRect, leftEye: CGPoint? = nil, rightEye: CGPoint? = nil) {
        self.bounds = bounds
        self.leftEye = leftEye
        self.rightEye = rightEye
    }

    static func fromNormalized(boundingBox: CGRect, leftEye: CGPoint?, rightEye: CGPoint?, imageSize: CGSize) -> CallFaceLandmarks {
        let bounds = CGRect(
            x: boundingBox.minX * imageSize.width,
            y: boundingBox.minY * imageSize.height,
            width: boundingBox.width * imageSize.width,
            height: boundingBox.height * imageSize.height
        )
        func place(_ point: CGPoint?) -> CGPoint? {
            point.map { CGPoint(x: bounds.minX + $0.x * bounds.width, y: bounds.minY + $0.y * bounds.height) }
        }
        return CallFaceLandmarks(bounds: bounds, leftEye: place(leftEye), rightEye: place(rightEye))
    }

    func smoothed(toward next: CallFaceLandmarks, factor: CGFloat) -> CallFaceLandmarks {
        let weight = min(max(factor, 0), 1)
        func blend(_ from: CGFloat, _ to: CGFloat) -> CGFloat { from + (to - from) * weight }
        func blendPoint(_ from: CGPoint?, _ to: CGPoint?) -> CGPoint? {
            guard let to else { return nil }
            guard let from else { return to }
            return CGPoint(x: blend(from.x, to.x), y: blend(from.y, to.y))
        }
        let bounds = CGRect(
            x: blend(self.bounds.minX, next.bounds.minX),
            y: blend(self.bounds.minY, next.bounds.minY),
            width: blend(self.bounds.width, next.bounds.width),
            height: blend(self.bounds.height, next.bounds.height)
        )
        return CallFaceLandmarks(bounds: bounds, leftEye: blendPoint(leftEye, next.leftEye), rightEye: blendPoint(rightEye, next.rightEye))
    }
    func scaled(to size: CGSize) -> CallFaceLandmarks {
        let transform = CGAffineTransform(scaleX: size.width, y: size.height)
        return CallFaceLandmarks(
            bounds: bounds.applying(transform),
            leftEye: leftEye?.applying(transform),
            rightEye: rightEye?.applying(transform)
        )
    }
}

nonisolated struct CallEmber: Equatable, Sendable {
    let center: CGPoint
    let radius: CGFloat
    let opacity: CGFloat
}

nonisolated enum CallFaceEffectGeometry {
    static func haloRect(for face: CGRect) -> CGRect {
        let width = face.width * 1.05
        let height = face.width * 0.3
        let centerY = face.maxY + face.height * 0.12
        return CGRect(x: face.midX - width / 2, y: centerY - height / 2, width: width, height: height)
    }

    static func hornRects(for face: CGRect) -> [CGRect] {
        let width = face.width * 0.3
        let height = face.height * 0.42
        let bottom = face.maxY - height * 0.35
        let inset = face.width * 0.12
        let left = CGRect(x: face.minX + inset, y: bottom, width: width, height: height)
        let right = CGRect(x: face.maxX - inset - width, y: bottom, width: width, height: height)
        return [left, right]
    }

    static func eyeCenters(for landmarks: CallFaceLandmarks) -> [CGPoint] {
        if let left = landmarks.leftEye, let right = landmarks.rightEye {
            return [left, right].sorted { $0.x < $1.x }
        }
        let face = landmarks.bounds
        return [
            CGPoint(x: face.minX + face.width * 0.32, y: face.minY + face.height * 0.6),
            CGPoint(x: face.minX + face.width * 0.68, y: face.minY + face.height * 0.6)
        ]
    }

    static func cheekCenters(for face: CGRect) -> [CGPoint] {
        [
            CGPoint(x: face.minX + face.width * 0.26, y: face.minY + face.height * 0.36),
            CGPoint(x: face.minX + face.width * 0.74, y: face.minY + face.height * 0.36)
        ]
    }

    static func wartCenters(for face: CGRect, count: Int, seed: UInt64) -> [CGPoint] {
        (0 ..< max(0, count)).map { index in
            let angle = unit(seed, index, 1) * 2 * .pi
            let distance = sqrt(unit(seed, index, 2)) * 0.34
            return CGPoint(
                x: face.midX + cos(angle) * distance * face.width,
                y: face.minY + face.height * 0.45 + sin(angle) * distance * face.height * 0.8
            )
        }
    }

    static func wartRadius(for face: CGRect) -> CGFloat {
        face.width * 0.025
    }

    static func eyeGlowRadius(for face: CGRect, time: TimeInterval) -> CGFloat {
        face.width * (0.07 + 0.012 * CGFloat(sin(time * 4)))
    }

    static func shimmer(time: TimeInterval) -> CGFloat {
        0.85 + 0.15 * CGFloat(sin(time * 2.4))
    }

    static func lavaHeight(time: TimeInterval, canvasHeight: CGFloat) -> CGFloat {
        canvasHeight * (0.16 + 0.03 * CGFloat(sin(time * 1.3)))
    }

    static func embers(count: Int, time: TimeInterval, canvas: CGRect, seed: UInt64) -> [CallEmber] {
        let clock = max(0, time)
        return (0 ..< max(0, count)).map { index in
            let speed = 0.12 + 0.18 * unit(seed, index, 3)
            let progress = (CGFloat(clock) * speed + unit(seed, index, 4)).truncatingRemainder(dividingBy: 1)
            let drift = CGFloat(sin(clock * 1.7 + Double(unit(seed, index, 5)) * 2 * .pi)) * canvas.width * 0.02
            let baseX = canvas.minX + canvas.width * (0.04 + 0.92 * unit(seed, index, 6))
            return CallEmber(
                center: CGPoint(x: baseX + drift, y: canvas.minY + progress * canvas.height * 0.85),
                radius: canvas.width * (0.004 + 0.008 * unit(seed, index, 7)),
                opacity: (1 - progress) * (0.6 + 0.4 * unit(seed, index, 8))
            )
        }
    }

    static func unit(_ seed: UInt64, _ index: Int, _ salt: UInt64) -> CGFloat {
        var z = seed &+ UInt64(truncatingIfNeeded: index) &* 0x9E37_79B9_7F4A_7C15 &+ salt &* 0xD1B5_4A32_D192_ED03
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z = z ^ (z >> 31)
        return CGFloat(z >> 11) / CGFloat(UInt64(1) << 53)
    }
}

nonisolated enum CallFaceEffectBudget {
    static func detectionStride(isDegraded: Bool) -> Int {
        isDegraded ? 10 : 5
    }

    static func emberCount(isDegraded: Bool) -> Int {
        isDegraded ? 12 : 28
    }

    static func wartCount(isDegraded: Bool) -> Int {
        isDegraded ? 3 : 6
    }

    static func allowsBloom(isDegraded: Bool) -> Bool {
        !isDegraded
    }

    static let emberOpacityLevels = 5
    static let glowReduction: CGFloat = 0.25

    static let landmarkSmoothing: CGFloat = 0.5
    static let missesBeforeLosingFace = 3
}

nonisolated enum CallFrameOrientation {
    static func orientation(forRotation degrees: Int) -> CGImagePropertyOrientation {
        switch ((degrees % 360) + 360) % 360 {
        case 90: return .right
        case 180: return .down
        case 270: return .left
        default: return .up
        }
    }

    static func inverse(of orientation: CGImagePropertyOrientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .right: return .left
        case .left: return .right
        case .rightMirrored: return .rightMirrored
        case .leftMirrored: return .leftMirrored
        default: return orientation
        }
    }

    static func uprightSize(of size: CGSize, rotation degrees: Int) -> CGSize {
        switch orientation(forRotation: degrees) {
        case .right, .left: return CGSize(width: size.height, height: size.width)
        default: return size
        }
    }
}
