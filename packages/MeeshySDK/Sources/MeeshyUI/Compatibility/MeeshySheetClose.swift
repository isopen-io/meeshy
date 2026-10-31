import SwiftUI

/// **Fermer une feuille que son HÔTE présente** (#13839).
///
/// Le compositeur pose ses feuilles dans sa propre pile, ancrées en bas, pour
/// que la scène se réduise au-dessus d'elles au lieu d'être couverte. Là,
/// `@Environment(\.dismiss)` ne ferme rien : aucune présentation système ne
/// porte la vue. L'hôte remet donc sa fermeture par `meeshySheetClose`, et une
/// feuille partagée la préfère au `dismiss()` système quand elle existe —
/// ailleurs (conversation, fil), rien ne change.
public nonisolated enum MeeshySheetClose {

    public enum Route: Equatable, Sendable {
        case host
        case system
    }

    public static func route(hasHostClose: Bool) -> Route {
        hasHostClose ? .host : .system
    }

    @MainActor
    public static func perform(host: (() -> Void)?, system: () -> Void) {
        switch route(hasHostClose: host != nil) {
        case .host: host?()
        case .system: system()
        }
    }
}

private struct MeeshySheetCloseKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// La fermeture d'une feuille posée par son hôte. `nil` partout où la
    /// feuille est une présentation système : `dismiss()` y suffit.
    public var meeshySheetClose: (() -> Void)? {
        get { self[MeeshySheetCloseKey.self] }
        set { self[MeeshySheetCloseKey.self] = newValue }
    }
}
