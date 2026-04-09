import SwiftUI

struct AdaptiveRootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .regular {
            iPadRootView()
        } else {
            RootView()
        }
    }
}
