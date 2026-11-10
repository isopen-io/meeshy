#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK02 = MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton")

    @MainActor @ViewBuilder
    static func contentK02(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
