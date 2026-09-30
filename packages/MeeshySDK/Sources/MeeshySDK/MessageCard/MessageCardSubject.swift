import Foundation

/// Un média qu'une carte a le droit de peindre, et où l'application ira le
/// chercher — le fichier, et l'image d'attente d'une vidéo.
public struct MessageCardSubjectMedia: Equatable, Sendable {
    public let media: MessageCardMedia
    public let fileURL: String
    public let posterURL: String?

    public init(media: MessageCardMedia, fileURL: String, posterURL: String? = nil) {
        self.media = media
        self.fileURL = fileURL
        self.posterURL = MessageCardText.nonBlank(posterURL)
    }
}

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
///
/// LES MÉDIAS (#8692) : une photo, une vidéo (sa première image) ou un son se
/// peignent — sauf une pièce CHIFFRÉE, dont le fichier n'est pas lisible
/// hors de la bulle. Une pièce floutée ou à vue unique rend le message
/// entier inexportable : la protection d'une pièce protège son message. Le
/// message CITÉ apporte aussi ses médias, après ceux de la réponse (#8901).
public struct MessageCardSubject: Equatable, Sendable {
    public let quoted: MessageCardPart?
    public let reply: MessageCardPart
    /// L'heure d'envoi de la réponse — la date qu'une carte peut afficher.
    public let sentAt: Date
    /// L'heure du message cité, quand l'appelant la connaît.
    public let quotedAt: Date?
    public let media: [MessageCardSubjectMedia]

    public init(quoted: MessageCardPart?, reply: MessageCardPart, sentAt: Date, quotedAt: Date? = nil, media: [MessageCardSubjectMedia] = []) {
        self.quoted = quoted
        self.reply = reply
        self.sentAt = sentAt
        self.quotedAt = quotedAt
        self.media = media
    }

    public struct Viewer: Equatable, Sendable {
        public let id: String
        public let displayName: String?
        public let username: String?

        public init(id: String, displayName: String?, username: String? = nil) {
            self.id = id
            self.displayName = displayName
            self.username = username
        }
    }

    /// Le message peut-il partir en image ? La même famille de gardes que « Copier ».
    public static func isExportable(_ message: MeeshyMessage, now: Date) -> Bool {
        if message.holdsViewOnce || message.isBlurred || message.attachments.contains(where: { $0.isBlurred || $0.isViewOnce }) { return false }
        if message.isDeleted || message.messageSource == .system { return false }
        if let expiresAt = message.expiresAt, expiresAt <= now { return false }
        return MessageCardText.nonBlank(message.content) != nil || !paintableMedia(of: message).isEmpty
    }

    /// Les pièces qu'une carte peut peindre — photo, vidéo, son, dans l'ordre du message.
    public static func paintableMedia(of message: MeeshyMessage) -> [MessageCardSubjectMedia] {
        paintableMedia(of: message.attachments)
    }

    static func paintableMedia(of attachments: [MeeshyMessageAttachment]) -> [MessageCardSubjectMedia] {
        attachments.compactMap { attachment in
            guard !attachment.isEncrypted, !attachment.isBlurred, !attachment.isViewOnce else { return nil }
            let kind: MessageCardMediaKind
            switch AttachmentKind(mimeType: attachment.mimeType) {
            case .image: kind = .image
            case .video: kind = .video
            case .audio: kind = .audio
            default: return nil
            }
            let file = MessageCardText.nonBlank(attachment.fileUrl) ?? MessageCardText.nonBlank(attachment.thumbnailUrl)
            guard let file else { return nil }
            let aspect = aspect(width: attachment.width, height: attachment.height)
            return MessageCardSubjectMedia(
                media: MessageCardMedia(
                    id: attachment.id.isEmpty ? file : attachment.id,
                    kind: kind,
                    aspect: aspect,
                    duration: attachment.duration.map { Double($0) / 1000 },
                    name: kind == .audio ? (attachment.title ?? attachment.originalName) : nil
                ),
                fileURL: file,
                posterURL: kind == .video ? attachment.thumbnailUrl : nil
            )
        }
    }

    private static func aspect(width: Int?, height: Int?) -> Double {
        guard let width, let height, width > 0, height > 0 else { return 1 }
        return Double(width) / Double(height)
    }

    /// - Parameters:
    ///   - servedText: le texte que le lecteur a sous les yeux (Prisme, ou la langue imposée par « Traduire »).
    ///   - translations: les traductions servies du message, par code de langue.
    ///   - language: la langue d'export choisie — `nil` : la carte montre ce que le lecteur lit.
    ///   - quotedAt: l'heure du message cité, quand l'appelant l'a sous la main.
    ///   - quotedMessage: le message cité RÉEL quand il est en mémoire — il apporte
    ///     toutes ses pièces peignables ; sinon la citation apporte la sienne.
    public static func of(
        message: MeeshyMessage,
        servedText: String?,
        translations: [String: String],
        viewer: Viewer,
        language: String? = nil,
        quotedAt: Date? = nil,
        quotedMessage: MeeshyMessage? = nil,
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
        let media = paintableMedia(of: message)
        let text = MessageCardText.nonBlank(chosen)
        guard text != nil || !media.isEmpty else { return nil }
        let isViewer = message.isMe || message.senderId == viewer.id
        let reply = MessageCardPart(
            author: author(isViewer: isViewer, names: [message.senderName, message.senderUsername], viewer: viewer),
            text: text ?? "",
            handle: isViewer ? (viewer.username ?? message.senderUsername) : message.senderUsername
        )
        return MessageCardSubject(
            quoted: quote(message.replyTo, viewer: viewer, now: now),
            reply: reply,
            sentAt: message.createdAt,
            quotedAt: message.replyTo == nil ? nil : quotedAt,
            media: media + quotedMedia(message.replyTo, quotedMessage: quotedMessage, now: now).filter { quoted in
                !media.contains { $0.media.id == quoted.media.id }
            }
        )
    }

    /// **LE MÉDIA DU MESSAGE CITÉ** (#8901) — répondre à une photo par du texte,
    /// c'est répondre À la photo : la carte la peint, après les médias de la
    /// réponse. Mêmes gardes que la citation (story, humeur, protégée,
    /// supprimée, échue ⇒ rien) ; le message cité RÉEL, quand il est en
    /// mémoire, apporte toutes ses pièces sous SES gardes (`isExportable`,
    /// `paintableMedia`) ; sinon la citation apporte la pièce qu'elle décrit.
    static func quotedMedia(_ reference: ReplyReference?, quotedMessage: MeeshyMessage?, now: Date) -> [MessageCardSubjectMedia] {
        guard let reference, !reference.isStoryReply, reference.moodEmoji == nil,
              !reference.quotedMediaIsProtected, !reference.isQuotedMessageDeleted else { return [] }
        if let expiresAt = reference.quotedExpiresAt, expiresAt <= now { return [] }
        if let quotedMessage, quotedMessage.id == reference.messageId {
            return isExportable(quotedMessage, now: now) ? paintableMedia(of: quotedMessage) : []
        }
        guard let attachment = reference.quotedAttachment else { return [] }
        return paintableMedia(of: [attachment])
    }

    /// **Un COMMENTAIRE devient une carte** (#8692) — le texte servi par le
    /// Prisme (`displayContent`), son auteur et ses médias. Un commentaire
    /// éphémère, flouté ou à vue unique ne part jamais en image.
    ///
    /// **L'arbre de réponses** (#8709) : une réponse emporte sa RACINE en
    /// citation (`quoting`), dans le texte que le Prisme sert au lecteur. Une
    /// racine protégée ou vide ne se cite pas — la réponse part seule.
    public static func of(comment: FeedComment, viewer: Viewer, showOriginal: Bool = false, quoting root: FeedComment? = nil) -> MessageCardSubject? {
        guard !comment.effects.flags.hasLifecycleEffect else { return nil }
        let media = paintableMedia(of: comment)
        let text = MessageCardText.nonBlank(showOriginal ? comment.content : comment.displayContent)
        guard text != nil || !media.isEmpty else { return nil }
        let quoted = root.flatMap { quote(comment: $0, viewer: viewer) }
        return MessageCardSubject(
            quoted: quoted,
            reply: part(of: comment, text: text ?? "", viewer: viewer),
            sentAt: comment.timestamp,
            quotedAt: quoted == nil ? nil : root?.timestamp,
            media: media
        )
    }

    private static func quote(comment root: FeedComment, viewer: Viewer) -> MessageCardPart? {
        guard !root.effects.flags.hasLifecycleEffect, let text = MessageCardText.nonBlank(root.displayContent) else { return nil }
        return part(of: root, text: text, viewer: viewer)
    }

    private static func part(of comment: FeedComment, text: String, viewer: Viewer) -> MessageCardPart {
        let isViewer = !viewer.id.isEmpty && comment.authorId == viewer.id
        return MessageCardPart(
            author: author(isViewer: isViewer, names: [comment.author, comment.authorUsername], viewer: viewer),
            text: text,
            handle: comment.authorUsername
        )
    }

    public static func paintableMedia(of comment: FeedComment) -> [MessageCardSubjectMedia] {
        comment.media.compactMap { item in
            let kind: MessageCardMediaKind
            switch item.type {
            case .image: kind = .image
            case .video: kind = .video
            case .audio: kind = .audio
            case .document: return nil
            }
            guard let file = MessageCardText.nonBlank(item.url) ?? MessageCardText.nonBlank(item.thumbnailUrl) else { return nil }
            return MessageCardSubjectMedia(
                media: MessageCardMedia(
                    id: item.id, kind: kind,
                    aspect: aspect(width: item.width, height: item.height),
                    duration: item.duration.map { Double($0) },
                    name: kind == .audio ? item.fileName : nil
                ),
                fileURL: file,
                posterURL: kind == .video ? item.thumbnailUrl : nil
            )
        }
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
        return MessageCardPart(
            author: author(isViewer: reference.isMe, names: [reference.authorName], viewer: viewer),
            text: text,
            handle: reference.isMe ? viewer.username : nil
        )
    }

    private static func author(isViewer: Bool, names: [String?], viewer: Viewer) -> String {
        let candidates = isViewer ? [viewer.displayName] + names : names
        return candidates.lazy.compactMap { MessageCardText.nonBlank($0) }.first ?? "Meeshy"
    }

    /// Le nom du fichier : lisible dans une galerie, sans rien du contenu.
    public static func fileName(at date: Date, output: MessageCardOutput = .image, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let pad: (Int?) -> String = { String(format: "%02d", $0 ?? 0) }
        return "meeshy-\(parts.year ?? 0)\(pad(parts.month))\(pad(parts.day))-\(pad(parts.hour))\(pad(parts.minute))\(pad(parts.second)).\(output.fileExtension)"
    }
}

public extension MessageCardInput {
    /// La carte telle que le format la demande — un titre absent ou vide n'est
    /// jamais « affiché », et un auteur anonymisé cède son nom à `anonymousLabel`.
    /// « Pseudo au lieu du nom affiché » peint `@pseudo` quand on le connaît.
    /// Le filigrane, lui, garde toujours le pseudo de qui exporte.
    static func of(
        subject: MessageCardSubject,
        format: MessageCardFormat,
        handle: String?,
        conversationTitle: String?,
        anonymousLabel: String,
        formatDate: (Date) -> String,
        formatTime: (Date) -> String = { _ in "" },
        media: [MessageCardMedia]? = nil
    ) -> MessageCardInput {
        let named: (MessageCardPart) -> MessageCardPart = { part in
            guard format.useHandles, let handle = part.handle else { return part }
            return MessageCardPart(author: "@\(handle)", text: part.text, handle: handle)
        }
        let quoted = subject.quoted.map { format.anonymizeQuoted ? MessageCardPart(author: anonymousLabel, text: $0.text) : named($0) }
        let reply = format.anonymizeReply ? MessageCardPart(author: anonymousLabel, text: subject.reply.text) : named(subject.reply)
        return MessageCardInput(
            quoted: quoted,
            reply: reply,
            template: format.template,
            handle: handle,
            title: format.showConversationTitle ? conversationTitle : nil,
            date: format.showDate ? formatDate(subject.sentAt) : nil,
            showAuthors: format.showAuthors,
            media: media ?? subject.media.map(\.media),
            disposition: format.disposition,
            quotedTime: format.showTimes ? subject.quotedAt.map(formatTime) : nil,
            replyTime: format.showTimes ? formatTime(subject.sentAt) : nil
        )
    }
}

public extension MessageCardSubject {
    /// Les pseudos sont-ils connus ? L'option « pseudo au lieu du nom affiché » n'existe qu'alors.
    var hasHandles: Bool { reply.handle != nil || quoted?.handle != nil }
}
