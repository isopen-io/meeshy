#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK13 = MeeshyKitCatalogEntry(key: "K13", name: "MeeshySplitActionButton")

    @MainActor @ViewBuilder
    static func contentK13(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
