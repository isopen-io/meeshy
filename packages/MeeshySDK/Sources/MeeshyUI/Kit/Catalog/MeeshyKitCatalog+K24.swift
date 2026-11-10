#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK24 = MeeshyKitCatalogEntry(key: "K24", name: "MeeshyContextLines")

    @MainActor @ViewBuilder
    static func contentK24(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
