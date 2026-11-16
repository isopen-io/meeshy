import Foundation
import MeeshySDK

// MARK: - Le mode REGARD (#18721)

/// Comment une conversation s'ouvre. Au toucher (liste, bannière touchée,
/// lien), on la LIT : l'écran marque lu ce qu'il montre. Tirée depuis la
/// bannière, on la REGARDE : rien n'est marqué lu tant que l'utilisateur n'a
/// pas agi dedans — la conversation reste non lue partout, serveur compris.
nonisolated enum ConversationOpening: Equatable, Sendable {
    case read
    case peek
}

/// Ce que l'utilisateur fait dans une conversation ouverte.
nonisolated enum ConversationAct: CaseIterable, Sendable {
    case sendMessage
    case sendAttachment
    case toggleReaction
    case scroll
    case playAudio
    case openMedia
}

/// Quels actes mettent fin au regard. Répondre — un message, une pièce
/// jointe ou un vocal, une réaction — dit « j'ai lu » ; parcourir, écouter un
/// vocal ou ouvrir une image ne le dit pas : on peut regarder sans s'engager.
nonisolated enum PeekReadLaw {

    static func marksRead(on act: ConversationAct) -> Bool {
        switch act {
        case .sendMessage, .sendAttachment, .toggleReaction: return true
        case .scroll, .playAudio, .openMedia: return false
        }
    }

    /// Les notifications qu'une bannière tirée ouvre EN REGARD : un message
    /// arrivé dans une conversation (reçu, réponse, mention). Les autres
    /// s'ouvrent comme au toucher — il n'y a rien à « laisser non lu ».
    static let peekableTypes: Set<MeeshyNotificationType> = [
        .newMessage, .legacyNewMessage, .messageReply, .reply, .userMentioned, .mention, .legacyMention
    ]

    /// La conversation que la bannière tirée ouvre en regard, ou `nil`.
    static func peekTarget(type: MeeshyNotificationType, conversationId: String?) -> String? {
        guard peekableTypes.contains(type), let conversationId, !conversationId.isEmpty else { return nil }
        return conversationId
    }
}

// MARK: - La demande, de la bannière à l'écran

/// Les ouvertures en regard demandées par une bannière et pas encore prises.
///
/// La bannière ne voit pas l'écran qu'elle ouvre : elle passe par le même
/// aiguillage que le toucher (routeur, verrou PIN, liste, cache, réseau), et
/// c'est le modèle de la conversation, à son `start()`, qui prend la demande.
/// Une demande vieillit : une ouverture qui n'aboutit pas (PIN abandonné,
/// réseau perdu) ne doit pas transformer en regard la prochaine ouverture
/// ordinaire de la même conversation.
enum PeekOpeningRequests {
    static let lifetime: TimeInterval = 30

    private static var requested: [String: Date] = [:]

    static func request(_ conversationId: String, at now: Date = Date()) {
        requested[conversationId] = now
    }

    /// Prend la demande (elle sert une fois) et dit comment ouvrir.
    static func take(_ conversationId: String, at now: Date = Date()) -> ConversationOpening {
        guard let requestedAt = requested.removeValue(forKey: conversationId) else { return .read }
        return now.timeIntervalSince(requestedAt) <= lifetime ? .peek : .read
    }
}

// MARK: - La lecture d'UNE conversation ouverte

/// Le regard d'une conversation ouverte : posé à l'ouverture, levé par le
/// premier acte qui compte. Une instance par écran (`ConversationDependencies`),
/// comme l'ère chiffrée — jamais un état global.
final class ConversationReadGate {
    nonisolated deinit {}

    private(set) var opening: ConversationOpening = .read

    /// L'écran peut-il marquer lu ce qu'il montre ?
    var marksReading: Bool { opening == .read }

    /// Ouvre la conversation dans le mode que la bannière a demandé (une
    /// lecture, à défaut), et dit si c'est une LECTURE — l'appelant fait alors
    /// ce qu'une lecture fait de plus : effacer la marque « non lu ».
    func opensReading(_ conversationId: String, at now: Date = Date()) -> Bool {
        opening = PeekOpeningRequests.take(conversationId, at: now)
        return marksReading
    }

    /// `true` si cet acte vient de mettre fin au regard : l'appelant marque
    /// alors la conversation lue, à l'instant.
    func noteActed(_ act: ConversationAct) -> Bool {
        guard opening == .peek, PeekReadLaw.marksRead(on: act) else { return false }
        opening = .read
        return true
    }
}

// MARK: - L'ouverture d'une feuille, vue du tiroir qui la précède

/// Où en est la feuille d'une conversation ouverte depuis la bannière : à
/// l'écran, puis peinte de ses messages. L'enveloppe du tiroir ne s'efface
/// qu'une fois la feuille peinte — sinon l'écran reste vide entre les deux.
enum ConversationOpeningStage: Int, Comparable {
    case shown
    case painted

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

@MainActor
enum ConversationOpeningPaint {
    private static var reachedStages: [String: ConversationOpeningStage] = [:]

    static func announce(_ stage: ConversationOpeningStage, for conversationId: String?) {
        guard let conversationId, !conversationId.isEmpty else { return }
        let current = reachedStages[conversationId]
        guard current.map({ $0 < stage }) ?? true else { return }
        reachedStages[conversationId] = stage
    }

    static func reached(_ stage: ConversationOpeningStage, for conversationId: String) -> Bool {
        reachedStages[conversationId].map { $0 >= stage } ?? false
    }

    static func forget(_ conversationId: String) {
        reachedStages[conversationId] = nil
    }
}
