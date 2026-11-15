import CoreGraphics

nonisolated enum ConversationPreviewWidthLaw {
    static let maximum: CGFloat = 340
    static let minimum: CGFloat = 240

    static func width(rowTextWidth: CGFloat) -> CGFloat {
        min(maximum, max(minimum, rowTextWidth + ConversationRowWidthLaw.chrome))
    }
}
