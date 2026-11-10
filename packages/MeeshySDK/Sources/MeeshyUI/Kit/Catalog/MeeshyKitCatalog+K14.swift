#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK14 = MeeshyKitCatalogEntry(key: "K14", name: "MeeshyStatusCapsule")

    @MainActor @ViewBuilder
    static func contentK14(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
