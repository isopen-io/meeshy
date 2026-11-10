#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK08 = MeeshyKitCatalogEntry(key: "K08", name: "MeeshyField")

    @MainActor @ViewBuilder
    static func contentK08(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
