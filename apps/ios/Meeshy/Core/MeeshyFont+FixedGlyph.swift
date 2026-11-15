import SwiftUI
import MeeshyUI

extension MeeshyFont {
    nonisolated static func fixedGlyph(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .default
    ) -> Font {
        Font.system(size: size, weight: weight, design: design)
    }
}
