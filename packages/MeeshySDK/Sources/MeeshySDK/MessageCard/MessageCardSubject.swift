import Foundation

/// **CE QU'UNE CARTE D'EXPORT A LE DROIT DE MONTRER** — miroir de
/// `apps/web/src/lib/export/message-card-subject.ts`.
///
/// GARDE : un message protégé (vue unique, flouté, éphémère échu, supprimé,
/// avis système) ne s'exporte pas. Une image est une copie qu'on partage : ce
/// qui ne se copie pas ne se peint pas. La CITATION est celle que la bulle
/// montre déjà (`ReplyReference.previewText`, gravée par le Prisme du lecteur
/// et remplacée par son placeholder quand le message cité est protégé) ; une
/// citation supprimée ou échue ne montre rien.
///
/// LES MOTS SONT CEUX QUE LE LECTEUR VOIT : le texte SERVI, jamais l'original
/// en douce — sauf quand l'exportateur CHOISIT une langue d'export : la
/// réponse part alors dans cette langue (son original, ou la traduction
/// servie), et la citation garde le Prisme du lecteur.
public struct MessageCardSubject: Equatable, Sendable {
    public let quoted: MessageCardPart?
    public let reply: MessageCardPart
    /// L'heure d'envoi de la réponse — la date qu'une carte peut afficher.
    public let sentAt: Date

    public init(quoted: MessageCardPart?, reply: MessageCardPart, sentAt: Date) {
        self.quoted = quoted
        self.reply = reply
        self.sentAt = sentAt
    }

    public struct Viewer: Equatable, Sendable {
        public let id: String
        public let displayName: String?

        public init(id: String, displayName: String?) {
            self.id = id
            self.displayName = displayName
        }
    }

    /// Le message peut-il partir en image ? La même famille de gardes que « Copier ».
    public static func isExportable(_ message: MeeshyMessage, now: Date) -> Bool {
        if message.holdsViewOnce || message.isBlurred || message.attachments.contains(where: { $0.isBlurred }) { return false }
        if message.isDeleted || message.messageSource == .system { return false }
        if let expiresAt = message.expiresAt, expiresAt <= now { return false }
        return MessageCardText.nonBlank(message.content) != nil
    }

    /// - Parameters:
    ///   - servedText: le texte que le lecteur a sous les yeux (Prisme, ou la langue imposée par « Traduire »).
    ///   - translations: les traductions servies du message, par code de langue.
    ///   - language: la langue d'export choisie — `nil` : la carte montre ce que le lecteur lit.
    public static func of(
        message: MeeshyMessage,
        servedText: String?,
        translations: [String: String],
        viewer: Viewer,
        language: String? = nil,
        now: Date
    ) -> MessageCardSubject? {
        guard isExportable(message, now: now) else { return nil }
        let chosen: String
        if let language {
            chosen = language.lowercased() == message.originalLanguage.lowercased()
                ? message.content
                : translation(in: language, of: translations) ?? message.content
        } else {
            chosen = servedText ?? message.content
        }
        guard let text = MessageCardText.nonBlank(chosen) else { return nil }
        let reply = MessageCardPart(
            author: author(isViewer: message.isMe || message.senderId == viewer.id, names: [message.senderName, message.senderUsername], viewer: viewer),
            text: text
        )
        return MessageCardSubject(quoted: quote(message.replyTo, viewer: viewer, now: now), reply: reply, sentAt: message.createdAt)
    }

    /// Les langues dans lesquelles la réponse EXISTE : son original d'abord, puis chaque traduction servie.
    public static func languages(of message: MeeshyMessage, translations: [String: String]) -> [String] {
        guard let original = MessageCardText.nonBlank(message.originalLanguage)?.lowercased() else { return [] }
        let served = translations.filter { MessageCardText.nonBlank($0.value) != nil }.keys.map { $0.lowercased() }.sorted()
        var seen = Set<String>()
        return ([original] + served).filter { seen.insert($0).inserted }
    }

    private static func translation(in language: String, of translations: [String: String]) -> String? {
        translations.first { $0.key.lowercased() == language.lowercased() }.flatMap { MessageCardText.nonBlank($0.value) }
    }

    private static func quote(_ reference: ReplyReference?, viewer: Viewer, now: Date) -> MessageCardPart? {
        guard let reference, !reference.isStoryReply, !reference.isQuotedMessageDeleted else { return nil }
        if let expiresAt = reference.quotedExpiresAt, expiresAt <= now { return nil }
        guard let text = MessageCardText.nonBlank(reference.previewText) else { return nil }
        return MessageCardPart(author: author(isViewer: reference.isMe, names: [reference.authorName], viewer: viewer), text: text)
    }

    private static func author(isViewer: Bool, names: [String?], viewer: Viewer) -> String {
        let candidates = isViewer ? [viewer.displayName] + names : names
        return candidates.lazy.compactMap { MessageCardText.nonBlank($0) }.first ?? "Meeshy"
    }

    /// Le nom du fichier : lisible dans une galerie, sans rien du contenu.
    public static func fileName(at date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let pad: (Int?) -> String = { String(format: "%02d", $0 ?? 0) }
        return "meeshy-\(parts.year ?? 0)\(pad(parts.month))\(pad(parts.day))-\(pad(parts.hour))\(pad(parts.minute))\(pad(parts.second)).png"
    }
}

public extension MessageCardInput {
    /// La carte telle que le format la demande — un titre absent ou vide n'est
    /// jamais « affiché », et un auteur anonymisé cède son nom à `anonymousLabel`.
    /// Le filigrane, lui, garde toujours le pseudo de qui exporte.
    static func of(
        subject: MessageCardSubject,
        format: MessageCardFormat,
        handle: String?,
        conversationTitle: String?,
        anonymousLabel: String,
        formatDate: (Date) -> String
    ) -> MessageCardInput {
        let quoted = subject.quoted.map { format.anonymizeQuoted ? MessageCardPart(author: anonymousLabel, text: $0.text) : $0 }
        let reply = format.anonymizeReply ? MessageCardPart(author: anonymousLabel, text: subject.reply.text) : subject.reply
        return MessageCardInput(
            quoted: quoted,
            reply: reply,
            template: format.template,
            handle: handle,
            title: format.showConversationTitle ? conversationTitle : nil,
            date: format.showDate ? formatDate(subject.sentAt) : nil,
            showAuthors: format.showAuthors
        )
    }
}
