#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK11 = MeeshyKitCatalogEntry(key: "K11", name: "MeeshyExpandingPill")

    @MainActor @ViewBuilder
    static func contentK11(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
