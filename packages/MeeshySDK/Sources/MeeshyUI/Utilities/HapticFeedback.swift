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
///
/// **Les retours haptiques ne se jouent qu'aux endroits stratégiques** (décision porteur, #19783) : l'issue d'une
/// action (succès, avertissement, erreur) et le geste qui engage une action (impacts moyen, fort, rigide : appui long,
/// envoi, prise de parole). Les tics d'ambiance — léger, doux, sélection, partout au défilement et au toucher anodin —
/// se taisent. Une seule loi, `plays(_:)`, en décide ; aucun générateur ne se crée hors d'ici.
public struct HapticFeedback {

    /// Ce qu'un retour haptique dit.
    public nonisolated enum Weight: Sendable, Equatable, CaseIterable {
        /// Un tic d'ambiance : défilement, épinglage, toucher anodin. Muet.
        case tick
        /// Le geste qui engage une action : appui long, envoi, prise de parole.
        case action
        /// L'issue d'une action : succès, avertissement, erreur.
        case outcome
    }

    /// La loi : seuls l'engagement d'une action et son issue se sentent.
    public nonisolated static func plays(_ weight: Weight) -> Bool {
        weight != .tick
    }

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
        guard plays(.tick) else { return }
        #if canImport(UIKit) && os(iOS)
        lightGenerator.prepare()
        lightGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func medium() {
        guard plays(.action) else { return }
        #if canImport(UIKit) && os(iOS)
        mediumGenerator.prepare()
        mediumGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func heavy() {
        guard plays(.action) else { return }
        #if canImport(UIKit) && os(iOS)
        heavyGenerator.prepare()
        heavyGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func rigid() {
        guard plays(.action) else { return }
        #if canImport(UIKit) && os(iOS)
        rigidGenerator.prepare()
        rigidGenerator.impactOccurred()
        #endif
    }

    @MainActor
    public static func soft() {
        guard plays(.tick) else { return }
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

    /// Le tic d'une sélection qui change : un tic d'ambiance, muet.
    @MainActor
    public static func selection() {
        guard plays(.tick) else { return }
        #if canImport(UIKit) && os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    @MainActor
    public static func success() {
        guard plays(.outcome) else { return }
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.success)
        #endif
    }

    @MainActor
    public static func warning() {
        guard plays(.outcome) else { return }
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.warning)
        #endif
    }

    @MainActor
    public static func error() {
        guard plays(.outcome) else { return }
        #if canImport(UIKit) && os(iOS)
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.error)
        #endif
    }
}
