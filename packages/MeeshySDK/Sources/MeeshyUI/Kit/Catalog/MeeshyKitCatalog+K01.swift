#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK01 = MeeshyKitCatalogEntry(key: "K01", name: "MeeshyGlassTone")

    @MainActor @ViewBuilder
    static func contentK01(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
