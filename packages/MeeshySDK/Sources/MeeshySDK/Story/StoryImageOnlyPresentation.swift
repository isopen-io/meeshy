import CoreGraphics

/// **Une scène qui n'est qu'une image se présente comme l'image** (#6636).
public enum StoryImageOnlyPresentation {

    public enum Verdict: Equatable, Sendable {
        case canvas
        case imageOnly(CGRect)
    }

    public enum DrawingExtent: Equatable, Sendable {
        case none
        case bounds(CGRect)
        case unmeasurable
    }

    public struct Footprint: Equatable, Sendable {
        public let position: CGPoint
        public let size: CGSize
        public let anchor: CGPoint
        public let rotationDegrees: Double

        public init(position: CGPoint, size: CGSize,
                    anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                    rotationDegrees: Double = 0) {
            self.position = position
            self.size = size
            self.anchor = anchor
            self.rotationDegrees = rotationDegrees
        }

        public var frame: CGRect { .zero }
    }

    public nonisolated static let overflowTolerance: CGFloat = 1

    public nonisolated static func resolve(effects: StoryEffects,
                                           mediaSize: CGSize?,
                                           canvasSize: CGSize,
                                           drawing: DrawingExtent = .none,
                                           footprint: (MeeshySceneObject) -> Footprint?) -> Verdict {
        .canvas
    }

    public nonisolated static func strokeBounds(_ strokes: [StoryDrawingStroke],
                                                designSize: CGSize,
                                                canvasSize: CGSize) -> DrawingExtent {
        .unmeasurable
    }
}
