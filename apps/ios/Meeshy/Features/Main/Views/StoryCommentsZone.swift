import CoreGraphics

// MARK: - LA ZONE DE COMMENTAIRES D'UNE STORY SUIT LE COMPOSEUR (#9893)

nonisolated enum StoryCommentsZone {

    enum ComposerState: Equatable, Sendable {
        case absent
        case folded
        case expanded
        case typing
    }

    struct Metrics: Equatable, Sendable {
        var windowHeight: CGFloat
        var safeBottom: CGFloat
        var topReserved: CGFloat
        var composerHeight: CGFloat?
        var keyboardHeight: CGFloat
    }

    struct Frame: Equatable, Sendable {
        var bottomInset: CGFloat
        var maxHeight: CGFloat
        var topEdge: CGFloat { bottomInset + maxHeight }
    }

    static let breathing: CGFloat = 20
    static let bubbleGap: CGFloat = 8
    static let fallbackPlateHeight: CGFloat = 92
    static let fallbackBubbleHeight: CGFloat = 44

    static func state(hasComposer: Bool, isShown: Bool,
                      presentation: StoryComposerFold.Presentation,
                      keyboardHeight: CGFloat) -> ComposerState {
        .absent
    }

    static func frame(for state: ComposerState, metrics: Metrics) -> Frame {
        Frame(bottomInset: 0, maxHeight: 0)
    }
}
