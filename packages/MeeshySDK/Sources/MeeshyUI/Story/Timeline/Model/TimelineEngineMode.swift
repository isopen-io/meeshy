import Foundation

/// Mode de fonctionnement du `StoryTimelineEngine`.
///
/// Partagé entre Plan 3 (Engine playback) et Plan 4 (Views / TimelineViewModel)
/// afin que la conformance `TimelineEngineProviding` du Plan 4 soit triviale
/// (mêmes cases, même fichier source, pas de bridge fragile).
///
/// - `editing` : édition en cours, le mixer audio est actif pour les contrôles
///   live (volume drag, mute toggle), mais la lecture est mise en pause au
///   moindre switch vers ce mode.
/// - `preview` : lecture passive de la composition, optimisée pour le playback
///   continu (mode par défaut).
public enum TimelineEngineMode: Sendable, Equatable {
    case editing
    case preview
}
