import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// **Ce que la Live Activity d'un vocal en cours d'enregistrement montre**
/// (#9784).
///
/// Compilé dans les DEUX cibles (`project.yml`) : l'app l'écrit
/// (`VoiceRecordingActivityLaw`), l'extension de widgets le peint. Le chrono
/// ne voyage pas : la vue le déroule depuis `startedAt`. Le niveau est
/// quantifié (`level`, 0…`maxLevel`) pour ne réveiller l'activité qu'à un
/// changement visible.
nonisolated struct VoiceRecordingSnapshot: Codable, Hashable, Sendable {
    static let maxLevel = 4

    var conversationId: String
    var title: String
    var statusLabel: String
    var startedAt: Date
    var level: Int
    var isFinished: Bool
}

nonisolated struct VoiceRecordingLabels: Codable, Hashable, Sendable {
    var stop: String
    var cancel: String
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
nonisolated struct VoiceRecordingActivityAttributes: ActivityAttributes, Sendable {
    typealias ContentState = VoiceRecordingSnapshot
    var labels: VoiceRecordingLabels
}
#endif
