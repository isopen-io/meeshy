import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Lightweight wrapper around `UIFeedbackGenerator` so call sites stay
/// short (`HapticFeedback.success()`) and platform-isolated. The real
/// generators only exist on iOS — on other Apple platforms (visionOS
/// runtime tests, macOS), the methods compile to no-ops.
///
/// Methods are `@MainActor`: `UIFeedbackGenerator` requires main-thread
/// invocation, and the cost of hopping a few microseconds in a swipe
/// gesture is negligible compared to skipping the haptic entirely.
///
/// Generators are kept as static `@MainActor`-isolated singletons so the
/// swipe / drag hot paths that fire dozens of taptics per second don't
/// allocate and tear down a fresh `UIImpactFeedbackGenerator` on every
/// call. `prepare()` is invoked before each event so the engine stays
/// warm — without it the very first tap feels missing.
public struct HapticFeedback {

    #if canImport(UIKit) && os(iOS)
    @MainActor private static let lightGenerator = UIImpactFeedbackGenerator(style: .light)
    @MainActor private static let mediumGenerator = UIImpactFeedbackGenerator(style: .medium)
    @MainActor private static let heavyGenerator = UIImpactFeedbackGenerator(style: .heavy)
    @MainActor private static let rigidGenerator = UIImpactFeedbackGenerator(style: .rigid)
    @MainActor private static let softGenerator = UIImpactFeedbackGenerator(style: .soft)
    @MainActor private static let notificationGenerator = UINotificationFeedbackGenerator()
    #endif

    @MainActor
    public static func light() {
        #if canImport(UIKit) && os(iOS)
        lightGenerator.prepare()
        lightGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func medium() {
        #if canImport(UIKit) && os(iOS)
        mediumGenerator.prepare()
        mediumGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func heavy() {
        #if canImport(UIKit) && os(iOS)
        heavyGenerator.prepare()
        heavyGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func rigid() {
        #if canImport(UIKit) && os(iOS)
        rigidGenerator.prepare()
        rigidGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func soft() {
        #if canImport(UIKit) && os(iOS)
        softGenerator.prepare()
        softGenerator.impactOccurred()
        #endif
    }

    #if canImport(UIKit) && os(iOS)
    @MainActor
    public static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        switch style {
        case .light: light()
        case .medium: medium()
        case .heavy: heavy()
        case .rigid: rigid()
        case .soft: soft()
        @unknown default: medium()
        }
    }

    @MainActor
    public static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        switch type {
        case .success: success()
        case .warning: warning()
        case .error: error()
        @unknown default: warning()
        }
    }
    #endif

    @MainActor
    public static func success() {
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.success)
        #endif
    }

    @MainActor
    public static func warning() {
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.warning)
        #endif
    }

    @MainActor
    public static func error() {
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.error)
        #endif
    }
}
