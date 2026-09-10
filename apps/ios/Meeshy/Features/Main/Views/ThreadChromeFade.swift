import CoreGraphics

nonisolated struct ThreadChromeFade: Equatable, Sendable {

    nonisolated struct Visibility: Equatable, Sendable {
        let header: Bool
        let composer: Bool

        static let hidden = Visibility(header: false, composer: false)
    }

    nonisolated struct Band: Equatable, Sendable {
        let clearExtent: CGFloat
        let opaqueExtent: CGFloat
        let isLifted: Bool
    }

    let top: Band?
    let bottom: Band?

    static let none = ThreadChromeFade(top: nil, bottom: nil)

    var isFullyLifted: Bool {
        (top?.isLifted ?? true) && (bottom?.isLifted ?? true)
    }

    static func headClearance(usesFlatRow: Bool) -> CGFloat {
        0
    }

    static func resolve(
        usesFlatRow: Bool,
        topInset: CGFloat,
        headerRowClearance: CGFloat,
        bottomRest: CGFloat,
        visibility: Visibility
    ) -> ThreadChromeFade {
        .none
    }
}
