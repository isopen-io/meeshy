#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK12 = MeeshyKitCatalogEntry(key: "K12", name: "MeeshyEdgeRails")

    @MainActor @ViewBuilder
    static func contentK12(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
