import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// **Ce que la Live Activity d'un vocal en lecture montre** (#9783).
///
/// Compilé dans les DEUX cibles (`project.yml`) : l'app l'écrit
/// (`VoicePlaybackActivityLaw`), l'extension de widgets le peint. Tout le
/// texte arrive LOCALISÉ par l'app.
///
/// La progression ne voyage pas à chaque tic : l'activité reçoit une position
/// DATÉE (`position` mesurée à `anchor`) et la vue la projette
/// (`ProgressView(timerInterval:)`). Elle n'est remise à jour qu'aux ruptures
/// — pause, reprise, saut, changement de piste ou de langue.
nonisolated struct VoicePlaybackSnapshot: Codable, Hashable, Sendable {
    var messageId: String
    var conversationId: String
    var title: String
    var subtitle: String
    var initials: String
    var accentHex: String
    var isPlaying: Bool
    var position: TimeInterval
    var duration: TimeInterval
    var rate: Double
    var anchor: Date
    /// Code de langue de la piste jouée (« FR »), `nil` quand elle est inconnue.
    var trackLanguage: String?
    var isTranslatedTrack: Bool
    var upNextCount: Int

    var fraction: Double {
        guard duration > 0 else { return 0 }
        return min(1, max(0, position / duration))
    }

    /// L'intervalle que la barre parcourt en lecture : commencé `position`
    /// secondes avant l'ancre, fini à la durée, au débit courant.
    var playbackInterval: ClosedRange<Date> {
        let speed = rate > 0 ? rate : 1
        let start = anchor.addingTimeInterval(-position / speed)
        let end = anchor.addingTimeInterval(max(0, duration - position) / speed)
        return start...max(start, end)
    }
}

nonisolated struct VoicePlaybackLabels: Codable, Hashable, Sendable {
    var play: String
    var pause: String
    var back: String
    var forward: String
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
nonisolated struct VoicePlaybackActivityAttributes: ActivityAttributes, Sendable {
    typealias ContentState = VoicePlaybackSnapshot
    var labels: VoicePlaybackLabels
}
#endif
