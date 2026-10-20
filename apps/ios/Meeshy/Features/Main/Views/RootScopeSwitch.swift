import SwiftUI
import MeeshyUI
import os

struct RootScopeSwitch<Scope: ObservableObject, Compact: View, Regular: View>: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @StateObject private var scope: Scope
    private let compact: (Scope) -> Compact
    private let regular: (Scope) -> Regular

    init(
        makeScope: @escaping () -> Scope,
        @ViewBuilder compact: @escaping (Scope) -> Compact,
        @ViewBuilder regular: @escaping (Scope) -> Regular
    ) {
        _scope = StateObject(wrappedValue: makeScope())
        self.compact = compact
        self.regular = regular
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                regular(scope)
            } else {
                compact(scope)
            }
        }
        .adaptiveOnChange(of: sizeClass) { _, _ in
            PerfSignpost.signposter.emitEvent("root.sizeClassCrossing")
        }
    }
}
