import Foundation
import MeeshySDK

/// **Quand la Live Activity d'envoi s'ouvre, se met à jour et se ferme** (#9680).
///
/// Un envoi LONG — un média, une story, une publication illustrée — se suit
/// dans la Dynamic Island et sur l'écran verrouillé tant qu'il est dans la
/// file, et l'activité se ferme sur son issue. Le reste de la file (texte,
/// réaction, lecture) est trop bref pour mériter l'îlot : il reste à la
/// pastille.
///
/// La loi est PURE — la file et le réseau entrent, une action sort — pour que
/// « quand ouvrir, quand fermer » se joue sans ActivityKit
/// (`OutboxActivityLawTests`). `OutboxLiveActivityCoordinator` n'en fait que
/// l'exécution.
///
/// Les deux ne se doublonnent pas à l'écran : le système ne montre JAMAIS dans
/// l'îlot l'activité de l'app au premier plan. Au premier plan, c'est la
/// pastille qui parle ; dès qu'on quitte l'app, l'îlot et l'écran verrouillé
/// prennent le relais.
enum OutboxActivityLaw {

    struct Running: Equatable, Sendable {
        var snapshot: OutboxActivitySnapshot
        /// Les envois longs qu'elle a suivis — eux seuls décident de l'issue.
        /// Une ligne échouée la veille ne fait pas virer au rouge l'envoi
        /// réussi de ce matin.
        var trackedIds: Set<String>
        var failedIds: Set<String>
    }

    enum Action: Equatable, Sendable {
        case none
        case start(OutboxActivitySnapshot)
        case update(OutboxActivitySnapshot)
        case end(OutboxActivitySnapshot)
    }

    struct Step: Equatable, Sendable {
        let running: Running?
        let action: Action
    }

    /// Les mots de l'activité, fournis par l'appelant pour que la loi reste
    /// jouable sans catalogue.
    struct Wording {
        let label: (OutboxUIItem) -> String
        let sent: String
        let failed: String
    }

    static let createPostKinds: Set<String> = ["createPost", "createReel", "createStatus"]

    /// Un envoi est LONG quand il téléverse quelque chose.
    static func isLong(_ item: OutboxUIItem) -> Bool {
        switch item.kind {
        case .story:
            return true
        case .message:
            return item.attachmentCount > 0 || mediaIcons.contains(item.iconKind)
        case .other(let raw):
            return createPostKinds.contains(raw) && item.attachmentCount > 0
        case .reaction, .edit, .delete, .postComment, .postReaction:
            return false
        }
    }

    static func isTerminal(_ status: OutboxStatus) -> Bool {
        status == .failed || status == .exhausted
    }

    static func step(
        running: Running?,
        items: [OutboxUIItem],
        isOffline: Bool,
        wording: Wording
    ) -> Step {
        let long = items.filter(isLong)
        let active = long.filter { !isTerminal($0.status) }
        let tracked = running?.trackedIds ?? []
        let failed = (running?.failedIds ?? []).union(
            long.filter { isTerminal($0.status) && tracked.contains($0.id) }.map(\.id)
        )

        guard let head = active.first else {
            guard running != nil else { return Step(running: nil, action: .none) }
            return Step(running: nil, action: .end(outcome(failed: !failed.isEmpty, wording: wording)))
        }

        let snapshot = OutboxActivitySnapshot(
            phase: isOffline ? .waitingForNetwork : .sending,
            remaining: active.count,
            label: wording.label(head),
            symbol: symbol(for: head)
        )
        let next = Running(
            snapshot: snapshot,
            trackedIds: tracked.union(active.map(\.id)),
            failedIds: failed
        )
        guard let running else { return Step(running: next, action: .start(snapshot)) }
        return Step(running: next, action: running.snapshot == snapshot ? .none : .update(snapshot))
    }

    /// Combien de temps l'issue reste affichée : court — une réussite se
    /// constate d'un regard, un échec se lit et se relance depuis l'app.
    static func dismissalDelay(for phase: OutboxActivitySnapshot.Phase) -> TimeInterval {
        phase == .failed ? 8 : 3
    }

    private static let mediaIcons: Set<OutboxUIItem.IconKind> = [.audio, .image, .video, .file]

    private static func outcome(failed: Bool, wording: Wording) -> OutboxActivitySnapshot {
        OutboxActivitySnapshot(
            phase: failed ? .failed : .sent,
            remaining: 0,
            label: failed ? wording.failed : wording.sent,
            symbol: failed ? "exclamationmark.circle.fill" : "checkmark.circle.fill"
        )
    }

    private static func symbol(for item: OutboxUIItem) -> String {
        if item.kind == .story { return "circle.dashed" }
        switch item.iconKind {
        case .audio: return "mic.fill"
        case .video: return "play.rectangle.fill"
        case .file: return "paperclip"
        case .image: return "photo.fill"
        case .text, .reaction, .sticker, .none: return "paperplane.fill"
        }
    }
}
