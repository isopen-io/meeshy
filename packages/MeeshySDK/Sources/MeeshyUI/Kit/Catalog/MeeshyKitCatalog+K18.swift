#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK18 = MeeshyKitCatalogEntry(key: "K18", name: "MeeshyObjectMenu")

    @MainActor @ViewBuilder
    static func contentK18(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
