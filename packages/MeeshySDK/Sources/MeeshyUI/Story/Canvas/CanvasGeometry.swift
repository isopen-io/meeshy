import Foundation
import CoreGraphics

public nonisolated struct CanvasGeometry: Equatable, Sendable {
    public static let designWidth: CGFloat = 1080
    public static let designHeight: CGFloat = 1920
    public static let designSize = CGSize(width: designWidth, height: designHeight)

    public let renderSize: CGSize
    public let scaleFactor: CGFloat

    public init(renderSize: CGSize) {
        self.renderSize = renderSize
        // 9:16 contraint → scaleFactor uniforme (basé sur largeur)
        self.scaleFactor = renderSize.width / Self.designWidth
    }

    public func render(_ designPoint: CGPoint) -> CGPoint {
        CGPoint(x: designPoint.x * scaleFactor, y: designPoint.y * scaleFactor)
    }

    public func render(_ designLength: CGFloat) -> CGFloat {
        designLength * scaleFactor
    }

    public func render(_ designSize: CGSize) -> CGSize {
        CGSize(width: designSize.width * scaleFactor, height: designSize.height * scaleFactor)
    }

    public func designLength(forNormalized n: CGFloat) -> CGFloat {
        n * Self.designWidth
    }

    public func designPoint(forNormalized n: CGPoint) -> CGPoint {
        CGPoint(x: n.x * Self.designWidth, y: n.y * Self.designHeight)
    }
}
