#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK15 = MeeshyKitCatalogEntry(key: "K15", name: "MeeshyAnchoredSheet")

    @MainActor @ViewBuilder
    static func contentK15(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
