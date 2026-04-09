import SwiftUI

struct AdaptiveRootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        // TODO: Re-enable iPad layout after fixing type-checker timeout in iPadRootView
        // if sizeClass == .regular {
        //     iPadRootView()
        // } else {
            RootView()
        // }
    }
}
