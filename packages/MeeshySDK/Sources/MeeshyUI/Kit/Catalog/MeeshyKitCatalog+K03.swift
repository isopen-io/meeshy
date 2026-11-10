#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK03 = MeeshyKitCatalogEntry(key: "K03", name: "MeeshySegmented")

    @MainActor @ViewBuilder
    static func contentK03(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
