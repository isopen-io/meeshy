import Foundation

// Extrait de `MessageModels.swift` (978 lignes, à la lisière du budget) : le
// lot #4945 enrichit le message CITÉ tel que le fil le sert — on extrait
// d'abord, on ajoute ensuite.

/// Le message CITÉ tel que `GET /messages` (`messages-list-query.ts`,
/// `replyTo.select`) et `message:new` le servent.
///
/// Sous-ensemble minimal jusqu'au cycle #4945 — `id`, `content`, `senderId`,
/// `sender`, `attachments` — alors que la passerelle sert depuis toujours la
/// langue d'origine, les traductions et les six champs de protection
/// (`reply-message-protection-contract`). Sans eux, iOS ne pouvait ni
/// descendre le Prisme sur le texte cité, ni savoir qu'une réponse à un
/// message à vue unique republiait son texte en clair dans chaque citation.
///
/// Tout est `decodeIfPresent` : un fil ancien, ou un écho socket allégé,
/// décode tel quel.
public struct APIMessageReplyTo: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
    public let originalLanguage: String?
    /// Les traductions du texte cité. Tolérant comme les blobs de Prisme
    /// d'`APIMessageAttachment` : une entrée écrite à moitié par un worker ne
    /// fait pas tomber la citation — elle rend l'original.
    public let translations: [APITextTranslation]?
    public let isViewOnce: Bool?
    public let isBlurred: Bool?
    public let expiresAt: Date?
    public let effectFlags: UInt32?
    public let isEncrypted: Bool?
    public let encryptionMode: String?

    private enum CodingKeys: String, CodingKey {
        case id, content, senderId, sender, attachments
        case originalLanguage, translations
        case isViewOnce, isBlurred, expiresAt, effectFlags, isEncrypted, encryptionMode
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        senderId = try c.decodeIfPresent(String.self, forKey: .senderId)
        sender = try c.decodeIfPresent(APIMessageSender.self, forKey: .sender)
        attachments = try c.decodeIfPresent([APIMessageAttachment].self, forKey: .attachments)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translations = (try? c.decodeIfPresent([APITextTranslation].self, forKey: .translations)) ?? nil
        isViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce)
        isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred)
        // La date suit la stratégie du décodeur appelant ; une forme qu'elle
        // ne lit pas laisse le champ nil sans perdre la citation — l'expiration
        // ne gouverne aucune protection ici (voir `isProtected`).
        expiresAt = (try? c.decodeIfPresent(Date.self, forKey: .expiresAt)) ?? nil
        effectFlags = try c.decodeIfPresent(UInt32.self, forKey: .effectFlags)
        isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted)
        encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
    }

    /// Le message cité ne doit pas republier son texte : vue unique, flouté ou
    /// chiffré — par les champs hérités OU par le bitfield canonique
    /// (`effectFlags`, seul porteur quand un client envoie le bit sans le
    /// champ), même lecture que `protectedPreview` côté passerelle.
    ///
    /// L'éphémère n'en fait PAS partie : son texte est lisible dans le fil
    /// jusqu'à l'expiration, et la citation vit dans ce même fil.
    public var isProtected: Bool {
        let flags = MessageEffectFlags(rawValue: effectFlags ?? 0)
        return isViewOnce == true || isBlurred == true || isEncrypted == true
            || flags.contains(.viewOnce) || flags.contains(.blurred)
    }
}

// MARK: - Représentatif d'une citation, côté fil

public extension Array where Element == APIMessageAttachment {
    /// La MÊME règle que `[MeeshyMessageAttachment].quotedRepresentative`
    /// (`CoreModels.swift`), sur le type du fil : le premier média hors
    /// localisation, sinon le premier tout court. Une seule règle, deux
    /// surcharges — la copie inline que `uiReplyTo` portait a divergé une fois
    /// (`.first` devant une localisation) et n'a plus le droit d'exister.
    var quotedRepresentative: APIMessageAttachment? {
        first(where: { $0.mimeType != "application/x-location" }) ?? first
    }
}

// MARK: - Vers la citation

public extension APIMessageReplyTo {
    /// Le SEUL constructeur de `ReplyReference` depuis le fil — partagé par le
    /// chemin réseau (`APIMessage.toMessage`) et le chemin cache
    /// (`MessagePersistenceActor.replyToJson`), qui divergeaient sur le média
    /// représentatif (`.first` contre hors-localisation), sur le type gravé
    /// (MIME brut contre `AttachmentKind`) et sur `isMe`.
    ///
    /// - `previewText` est ÉLU par le Prisme (`PrismTranslationResolver`) : le
    ///   prisme du lecteur est parcouru dans l'ordre, la première langue servie
    ///   gagne, `nil` ⇒ l'original — jamais `translations.first`. Un
    ///   cryptogramme (`isEncrypted`) n'est pas une traduction et se saute.
    /// - Un message cité PROTÉGÉ (`isProtected`) ne republie rien : le
    ///   placeholder porte le même vocabulaire que `protectedPreview` côté
    ///   passerelle (« 👁️ 🖼️ », « 🌫️ 💬 », « 🔒 🎵 »), et la citation entière
    ///   est déclarée protégée, vignette comprise.
    /// - Les sept faits du média représentatif voyagent avec elle.
    ///
    /// `isMe` se résout sur l'UTILISATEUR (`sender.userId`, sinon `senderId`),
    /// jamais sur l'identifiant de participant seul : `replyTo.senderId` est
    /// l'appartenance à la conversation, pas la personne.
    func toReplyReference(currentUserId: String?, preferredLanguages: [String]) -> ReplyReference {
        let representative = attachments?.quotedRepresentative
        let placeholder = isProtected ? protectedPlaceholder(for: representative) : nil
        return ReplyReference(
            messageId: id,
            authorName: sender?.name ?? "?",
            previewText: placeholder ?? prismPreviewText(preferredLanguages: preferredLanguages),
            isMe: currentUserId.map { (sender?.resolvedUserId ?? senderId) == $0 } ?? false,
            authorAvatarUrl: sender?.resolvedAvatar,
            attachmentType: representative?.mimeType.map { AttachmentKind(mimeType: $0).rawValue },
            attachmentThumbnailUrl: representative?.thumbnailUrl,
            attachmentIsProtected: isProtected ? true : representative?.declaredProtection,
            attachmentFacts: representative.map { ReplyReference.QuotedAttachmentFacts($0) }
        )
    }

    private func prismPreviewText(preferredLanguages: [String]) -> String {
        let original = content ?? ""
        let readable: [String: String] = (translations ?? []).reduce(into: [:]) { acc, translation in
            guard translation.isEncrypted != true else { return }
            acc[translation.targetLanguage] = translation.translatedContent
        }
        return PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            translations: readable,
            preferredLanguages: preferredLanguages
        )?.text ?? original
    }

    /// Même vocabulaire que `PROTECTION_ICON` + `CONTENT_TYPE_ICON`
    /// (`NotificationService.ts`), même précédence (vue unique, puis flouté,
    /// puis chiffré) — une citation et une bannière décrivent le même secret
    /// avec les mêmes mots.
    private func protectedPlaceholder(for representative: APIMessageAttachment?) -> String {
        let flags = MessageEffectFlags(rawValue: effectFlags ?? 0)
        let protectionIcon: String = {
            if isViewOnce == true || flags.contains(.viewOnce) { return "👁️" }
            if isBlurred == true || flags.contains(.blurred) { return "🌫️" }
            return "🔒"
        }()
        return "\(protectionIcon) \(Self.contentTypeIcon(mimeType: representative?.mimeType))"
    }

    private static func contentTypeIcon(mimeType: String?) -> String {
        guard let mimeType else { return "💬" }
        if mimeType.hasPrefix("image/") { return "🖼️" }
        if mimeType.hasPrefix("video/") { return "🎬" }
        if mimeType.hasPrefix("audio/") { return "🎵" }
        if mimeType == "application/x-location" { return "📍" }
        return "📎"
    }
}
