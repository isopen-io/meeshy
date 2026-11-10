#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK06 = MeeshyKitCatalogEntry(key: "K06", name: "MeeshyToggleRow")

    @MainActor @ViewBuilder
    static func contentK06(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
