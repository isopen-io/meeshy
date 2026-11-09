#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK20 = MeeshyKitCatalogEntry(key: "K20", name: "MeeshyThumbnailRow")

    @MainActor @ViewBuilder
    static func contentK20(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
