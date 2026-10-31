import Foundation

/// **Fermer un brouillon non vide se confirme** (#13839, L3).
///
/// ✕ fermait sans question (audit, défaut 26). Le brouillon est sauvegardé
/// automatiquement, donc « Garder le brouillon » ferme et garde, « Abandonner »
/// ferme et purge. Une composition que l'autosave ne garde pas (une porte
/// semée, une modification de story) ne promet jamais de la garder : la
/// question n'offre alors que d'abandonner ou de rester.
nonisolated enum ComposerCloseGuard {

    enum Decision: Equatable, Sendable {
        case closes
        case asks(offersKeep: Bool)
    }

    enum Choice: Equatable, Sendable {
        case keep
        case discard
    }

    enum Effect: Equatable, Sendable {
        case flushThenClose
        case purgeThenClose
    }

    /// `surfaceIsAutosaved` : la surface montée est-elle celle que l'autosave
    /// écrit ? Une scène ouverte par un média semé, une reprise ou la caméra
    /// vidéo ne l'est pas — elle a pourtant de la matière à ne pas perdre.
    static func decide(hasContent: Bool, surfaceIsAutosaved: Bool, controllerKeeps: Bool) -> Decision {
        hasContent ? .asks(offersKeep: surfaceIsAutosaved && controllerKeeps) : .closes
    }

    static func effect(_ choice: Choice) -> Effect {
        switch choice {
        case .keep: return .flushThenClose
        case .discard: return .purgeThenClose
        }
    }
}

nonisolated enum ComposerCloseGuardCopy {
    static var title: String {
        String(localized: "composer.close.title", defaultValue: "Fermer le brouillon ?", bundle: .main)
    }
    static var keep: String {
        String(localized: "composer.close.keep", defaultValue: "Garder le brouillon", bundle: .main)
    }
    static var discard: String {
        String(localized: "composer.close.discard", defaultValue: "Abandonner", bundle: .main)
    }
}
