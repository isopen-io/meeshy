import Foundation

/// **Quand la Live Activity d'un vocal en lecture s'ouvre, ce qu'elle montre
/// et quand elle se ferme** (#9783).
///
/// Une seule source d'état : le lecteur de l'app (`ConversationAudioCoordinator`),
/// le même qui alimente Now Playing et le mini-lecteur. La loi est PURE — son
/// état entre, une action sort (`VoicePlaybackActivityLawTests`) ;
/// `VoicePlaybackLiveActivityCoordinator` n'en fait que l'exécution.
///
/// - **La progression ne réveille pas l'activité à chaque tic** : la vue
///   projette une position DATÉE. La loi ne met à jour qu'aux ruptures — pause,
///   reprise, piste suivante, changement de langue, débit, et SAUT (une
///   position qui s'écarte de la projection de plus de `seekTolerance`).
/// - **La langue affichée est celle de la piste jouée**, élue par la langue du
///   texte servi (Prisme) — l'appelant la fournit, la loi ne redescend rien.
/// - **Un message protégé** (éphémère, vue unique, flouté, chiffré) se dit
///   par un libellé neutre à la place du nom de la conversation : aucun texte
///   du message ne part vers l'écran verrouillé.
enum VoicePlaybackActivityLaw {

    struct Track: Equatable, Sendable {
        var attachmentId: String
        var messageId: String
        var conversationId: String
        var conversationName: String
        var senderName: String
        var accentHex: String
        var isProtected: Bool
        var trackLanguage: String?
        var isTranslatedTrack: Bool
        var durationHint: TimeInterval
    }

    struct Input: Equatable, Sendable {
        var track: Track?
        var isPlaying: Bool
        var position: TimeInterval
        var duration: TimeInterval
        var rate: Double
        var upNextCount: Int
        var now: Date
    }

    struct Wording {
        let voiceMessage: String
        let protectedMessage: String
    }

    enum Action: Equatable, Sendable {
        case none
        case start(VoicePlaybackSnapshot)
        case update(VoicePlaybackSnapshot)
        case end(VoicePlaybackSnapshot)
    }

    struct Step: Equatable, Sendable {
        let running: VoicePlaybackSnapshot?
        let action: Action
    }

    static let seekTolerance: TimeInterval = 1.5
    static let skipInterval: TimeInterval = 15

    static func step(running: VoicePlaybackSnapshot?, input: Input, wording: Wording) -> Step {
        guard let next = snapshot(for: input, wording: wording) else {
            guard var final = running else { return Step(running: nil, action: .none) }
            final.position = projectedPosition(of: final, at: input.now)
            final.anchor = input.now
            final.isPlaying = false
            return Step(running: nil, action: .end(final))
        }
        guard let running else { return Step(running: next, action: .start(next)) }
        guard needsUpdate(from: running, to: next) else { return Step(running: running, action: .none) }
        return Step(running: next, action: .update(next))
    }

    static func snapshot(for input: Input, wording: Wording) -> VoicePlaybackSnapshot? {
        guard let track = input.track else { return nil }
        let duration = input.duration > 0 ? input.duration : track.durationHint
        let sender = track.senderName.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = sender.isEmpty ? wording.voiceMessage : sender
        return VoicePlaybackSnapshot(
            messageId: track.messageId,
            conversationId: track.conversationId,
            title: title,
            subtitle: track.isProtected ? wording.protectedMessage : track.conversationName,
            initials: CallActivityLaw.initials(of: sender),
            accentHex: track.accentHex,
            isPlaying: input.isPlaying,
            position: min(max(0, input.position), max(0, duration)),
            duration: max(0, duration),
            rate: input.rate > 0 ? input.rate : 1,
            anchor: input.now,
            trackLanguage: track.trackLanguage?.uppercased(),
            isTranslatedTrack: track.isTranslatedTrack,
            upNextCount: max(0, input.upNextCount)
        )
    }

    /// Où la barre en est À `date`, d'après ce que l'activité affiche.
    static func projectedPosition(of snapshot: VoicePlaybackSnapshot, at date: Date) -> TimeInterval {
        guard snapshot.isPlaying else { return snapshot.position }
        let elapsed = max(0, date.timeIntervalSince(snapshot.anchor)) * snapshot.rate
        return min(snapshot.duration, snapshot.position + elapsed)
    }

    /// La fraction que vise un saut de `offset` secondes depuis `position`,
    /// bornée à la piste.
    static func seekFraction(position: TimeInterval, duration: TimeInterval, offset: TimeInterval) -> Double? {
        guard duration > 0 else { return nil }
        return min(1, max(0, (position + offset) / duration))
    }

    private static func needsUpdate(from running: VoicePlaybackSnapshot, to next: VoicePlaybackSnapshot) -> Bool {
        var comparable = next
        comparable.position = running.position
        comparable.anchor = running.anchor
        guard comparable == running else { return true }
        let drift = abs(projectedPosition(of: running, at: next.anchor) - next.position)
        return drift > seekTolerance
    }
}
