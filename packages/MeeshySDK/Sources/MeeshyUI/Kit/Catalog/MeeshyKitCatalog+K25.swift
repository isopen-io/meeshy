#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK25 = MeeshyKitCatalogEntry(key: "K25", name: "MeeshyDragTargets")

    @MainActor @ViewBuilder
    static func contentK25(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
