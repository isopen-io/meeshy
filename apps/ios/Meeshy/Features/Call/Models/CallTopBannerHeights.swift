import SwiftUI

/// #17791 — chaque bandeau de la pile rend sa hauteur réelle à l'écran d'appel, qui en déduit
/// la place de ma vignette (`CallTopBannerStack.selfTileClearance`).
struct CallTopBannerHeightsKey: PreferenceKey {
    static let defaultValue: [CallTopBanner: CGFloat] = [:]

    static func reduce(value: inout [CallTopBanner: CGFloat], nextValue: () -> [CallTopBanner: CGFloat]) {
        value.merge(nextValue()) { _, new in new }
    }
}

struct CallTopBannerHeightReporter: ViewModifier {
    let banner: CallTopBanner

    func body(content: Content) -> some View {
        content.background(GeometryReader { proxy in
            Color.clear.preference(key: CallTopBannerHeightsKey.self, value: [banner: proxy.size.height])
        })
    }
}
