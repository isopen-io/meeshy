import SwiftUI

public struct HapticFeedback {
    public static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    public static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    public static func heavy() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }

    public static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    public static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
