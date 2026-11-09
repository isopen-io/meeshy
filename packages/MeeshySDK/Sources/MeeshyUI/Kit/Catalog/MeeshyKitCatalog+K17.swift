#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK17 = MeeshyKitCatalogEntry(key: "K17", name: "MeeshyKeyboardDock")

    @MainActor @ViewBuilder
    static func contentK17(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
