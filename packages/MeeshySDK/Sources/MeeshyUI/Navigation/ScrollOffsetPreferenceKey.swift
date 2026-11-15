import SwiftUI
import MeeshySDK

public struct ScrollOffsetPreferenceKey: PreferenceKey {
    private nonisolated static let defaultSlot = Locked<CGFloat>(0)

    public nonisolated static var defaultValue: CGFloat {
        get { defaultSlot.read { $0 } }
        set { defaultSlot.mutate { $0 = newValue } }
    }

    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
