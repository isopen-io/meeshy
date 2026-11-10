#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK16 = MeeshyKitCatalogEntry(key: "K16", name: "MeeshyModeChrome")

    @MainActor @ViewBuilder
    static func contentK16(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
