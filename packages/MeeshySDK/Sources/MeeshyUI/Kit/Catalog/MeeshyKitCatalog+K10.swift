#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK10 = MeeshyKitCatalogEntry(key: "K10", name: "MeeshyGlassPill")

    @MainActor @ViewBuilder
    static func contentK10(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
