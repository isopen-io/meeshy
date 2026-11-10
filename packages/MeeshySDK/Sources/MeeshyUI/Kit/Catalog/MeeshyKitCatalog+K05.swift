#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK05 = MeeshyKitCatalogEntry(key: "K05", name: "MeeshyLabeledSlider")

    @MainActor @ViewBuilder
    static func contentK05(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
