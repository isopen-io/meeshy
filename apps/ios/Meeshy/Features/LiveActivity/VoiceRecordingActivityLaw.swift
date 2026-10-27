import Foundation

/// **Quand la Live Activity d'un vocal en cours d'enregistrement s'ouvre, ce
/// qu'elle montre et quand elle se ferme** (#9784).
///
/// La loi est PURE (`VoiceRecordingActivityLawTests`) ;
/// `VoiceRecordingLiveActivityCoordinator` l'exécute depuis l'enregistreur de
/// la conversation (`AudioRecorderManager`), seule source de l'état.
///
/// - **Jamais d'enregistrement fantôme** : l'activité n'existe que tant que
///   l'enregistreur enregistre. Arrêt, envoi, abandon, vue démontée — elle se
///   ferme, immédiatement.
/// - **Le chrono ne voyage pas** : la vue le déroule depuis `startedAt`, figé
///   à l'ouverture.
/// - **Le niveau est quantifié** (0…`VoiceRecordingSnapshot.maxLevel`) et ne
///   réveille l'activité qu'au plus une fois par `levelUpdateInterval` :
///   l'enregistreur mesure vingt fois par seconde, ActivityKit n'en veut pas
///   autant.
/// - **Aucune limite de durée** : l'enregistrement n'a plus de plafond
///   (directive produit 2026-07-26, `AudioRecorderManager.configure(with:)`),
///   l'activité n'en invente pas.
enum VoiceRecordingActivityLaw {

    struct Input: Equatable, Sendable {
        var isRecording: Bool
        var conversationId: String
        var title: String
        var startedAt: Date
        var levels: [Double]
        var now: Date
    }

    struct Running: Equatable, Sendable {
        var snapshot: VoiceRecordingSnapshot
        var lastUpdate: Date
    }

    struct Wording {
        let recording: String
    }

    enum Action: Equatable, Sendable {
        case none
        case start(VoiceRecordingSnapshot)
        case update(VoiceRecordingSnapshot)
        case end(VoiceRecordingSnapshot)
    }

    struct Step: Equatable, Sendable {
        let running: Running?
        let action: Action
    }

    static let levelUpdateInterval: TimeInterval = 1

    static func step(running: Running?, input: Input?, wording: Wording) -> Step {
        guard let input, input.isRecording else {
            guard var final = running?.snapshot else { return Step(running: nil, action: .none) }
            final.isFinished = true
            final.level = 0
            return Step(running: nil, action: .end(final))
        }
        guard let running, running.snapshot.conversationId == input.conversationId else {
            let opened = VoiceRecordingSnapshot(
                conversationId: input.conversationId,
                title: input.title,
                statusLabel: wording.recording,
                startedAt: input.startedAt,
                level: quantizedLevel(input.levels),
                isFinished: false
            )
            return Step(running: Running(snapshot: opened, lastUpdate: input.now), action: .start(opened))
        }
        var next = running.snapshot
        next.title = input.title
        next.level = quantizedLevel(input.levels)
        guard next != running.snapshot else { return Step(running: running, action: .none) }
        let onlyLevel = next.title == running.snapshot.title
        guard !onlyLevel || input.now.timeIntervalSince(running.lastUpdate) >= levelUpdateInterval else {
            return Step(running: running, action: .none)
        }
        return Step(running: Running(snapshot: next, lastUpdate: input.now), action: .update(next))
    }

    /// Le niveau affiché : la moyenne des dernières mesures (0…1), en
    /// `maxLevel + 1` crans.
    static func quantizedLevel(_ levels: [Double]) -> Int {
        guard !levels.isEmpty else { return 0 }
        let mean = levels.reduce(0, +) / Double(levels.count)
        let clamped = min(1, max(0, mean))
        return Int((clamped * Double(VoiceRecordingSnapshot.maxLevel)).rounded())
    }
}
