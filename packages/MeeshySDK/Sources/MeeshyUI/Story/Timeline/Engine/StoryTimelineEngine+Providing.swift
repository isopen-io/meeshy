import Foundation
import MeeshySDK

/// Bridges the concrete `StoryTimelineEngine` (Plan 3) to the `TimelineEngineProviding`
/// protocol (Plan 4 / Task 7) so the composer can inject the real engine into
/// `TimelineViewModel` without exposing AVFoundation internals to the ViewModel layer.
///
/// `TimelineEngineMode` est partagé entre Plan 3 et Plan 4 via le fichier
/// `Story/Timeline/Model/TimelineEngineMode.swift`. `StoryTimelineEngine.mode` est
/// directement de type `TimelineEngineMode` — pas de mapping ni d'enum dupliqué.
///
/// L'extension est minimale : toutes les properties (currentTime, isPlaying, isMuted,
/// masterVolume, onTimeUpdate, onPlaybackEnd, onElementBecameActive, onError, mode) et
/// toutes les méthodes (configure, play, pause, seek, stop, toggle, setMode) sont déjà
/// exposées publiquement par `StoryTimelineEngine` avec exactement les signatures
/// requises par le protocol. La conformance se fait par déclaration uniquement.
extension StoryTimelineEngine: TimelineEngineProviding {}
