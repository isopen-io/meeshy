#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK23 = MeeshyKitCatalogEntry(key: "K23", name: "MeeshySelectionFeedback")

    @MainActor @ViewBuilder
    static func contentK23(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        EmptyView()
    }
}
#endif
