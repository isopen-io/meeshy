import Foundation

// MARK: - Address

/// L'adresse d'un lien de conversation telle qu'on la montre, copie et
/// repartage : `meeshy.me/chat/<linkId>` (#7795, précision porteur
/// 2026-09-24).
///
/// Jamais `/l/<token>` — c'est une adresse de SUIVI, qui compterait un clic à
/// chaque repartage — et jamais le slug `identifier` : un identifiant généré
/// commence lui aussi par `mshy_` et a déjà servi une adresse que personne ne
/// pouvait ouvrir (`69cd6f6b85`). `linkId` est l'identifiant public.
public struct ShareLinkAddress: Equatable, Sendable {
    public let linkId: String

    public init(linkId: String) {
        self.linkId = linkId
    }

    public var absoluteString: String {
        Self.absolute(origin: MeeshyConfig.shared.webOrigin, linkId: linkId)
    }

    public var url: URL? { URL(string: absoluteString) }

    /// La forme lisible, sans schéma : `meeshy.me/chat/mshy_…`.
    public var displayString: String {
        Self.display(origin: MeeshyConfig.shared.webOrigin, linkId: linkId)
    }

    static func absolute(origin: String, linkId: String) -> String {
        "\(origin)/chat/\(linkId)"
    }

    static func display(origin: String, linkId: String) -> String {
        let absolute = absolute(origin: origin, linkId: linkId)
        guard let range = absolute.range(of: "://") else { return absolute }
        return String(absolute[range.upperBound...])
    }
}

// MARK: - Guest rights

/// Ce qu'un invité SANS compte peut faire dans la conversation.
public struct ShareLinkGuestRights: Equatable, Sendable {
    public var messages: Bool
    public var images: Bool
    public var files: Bool
    public var history: Bool

    public init(messages: Bool, images: Bool, files: Bool, history: Bool) {
        self.messages = messages
        self.images = images
        self.files = files
        self.history = history
    }

    /// Les défauts de `ConversationShareLink` (schéma Prisma) — ce que la
    /// passerelle applique à un lien qui ne précise rien.
    public static let schemaDefaults = ShareLinkGuestRights(messages: true, images: true, files: false, history: true)

    /// Résout chaque droit ABSENT du fil par son défaut de schéma.
    public init(messages: Bool?, images: Bool?, files: Bool?, history: Bool?) {
        let defaults = Self.schemaDefaults
        self.init(
            messages: messages ?? defaults.messages,
            images: images ?? defaults.images,
            files: files ?? defaults.files,
            history: history ?? defaults.history
        )
    }
}

// MARK: - Conversation summary (`?expand=conversation`)

public struct ShareLinkConversationSummary: Codable, Sendable, Equatable {
    public let id: String
    public let title: String?
    public let type: String?
    public let description: String?
    public let avatar: String?

    public init(id: String, title: String?, type: String? = nil, description: String? = nil, avatar: String? = nil) {
        self.id = id
        self.title = title
        self.type = type
        self.description = description
        self.avatar = avatar
    }
}

// MARK: - Settings (the editable set)

/// Tout ce que le propriétaire d'un lien peut modifier par
/// `PATCH /links/:linkId` (#7797). Un seul type pour la lecture (la carte
/// « Configuration ») et l'écriture (le formulaire) : ils ne peuvent pas
/// diverger.
public struct ShareLinkSettings: Equatable, Sendable {
    public var name: String
    public var description: String
    public var expiresAt: Date?
    public var maxUses: Int?
    public var maxConcurrentUsers: Int?
    public var requireAccount: Bool
    public var requireNickname: Bool
    public var requireEmail: Bool
    public var requireBirthday: Bool
    /// Vide = toutes les langues.
    public var allowedLanguages: [String]
    public var guestRights: ShareLinkGuestRights

    public init(
        name: String,
        description: String,
        expiresAt: Date?,
        maxUses: Int?,
        maxConcurrentUsers: Int?,
        requireAccount: Bool,
        requireNickname: Bool,
        requireEmail: Bool,
        requireBirthday: Bool,
        allowedLanguages: [String],
        guestRights: ShareLinkGuestRights
    ) {
        self.name = name
        self.description = description
        self.expiresAt = expiresAt
        self.maxUses = maxUses
        self.maxConcurrentUsers = maxConcurrentUsers
        self.requireAccount = requireAccount
        self.requireNickname = requireNickname
        self.requireEmail = requireEmail
        self.requireBirthday = requireBirthday
        self.allowedLanguages = allowedLanguages
        self.guestRights = guestRights
    }

    /// Les limites que la passerelle refuserait (`positive()` côté Zod) — le
    /// formulaire ne propose pas d'enregistrer ce qui serait rejeté.
    public var isValid: Bool {
        let positive: (Int?) -> Bool = { $0.map { $0 >= 1 } ?? true }
        return positive(maxUses) && positive(maxConcurrentUsers)
    }
}

public extension MyShareLink {
    /// La configuration servie, chaque champ absent résolu par son défaut de
    /// schéma — jamais inventé.
    var settings: ShareLinkSettings {
        ShareLinkSettings(
            name: name ?? "",
            description: description ?? "",
            expiresAt: expiresAt,
            maxUses: maxUses,
            maxConcurrentUsers: maxConcurrentUsers,
            requireAccount: requireAccount ?? false,
            requireNickname: requireNickname ?? true,
            requireEmail: requireEmail ?? false,
            requireBirthday: requireBirthday ?? false,
            allowedLanguages: allowedLanguages ?? [],
            guestRights: ShareLinkGuestRights(
                messages: allowAnonymousMessages,
                images: allowAnonymousImages,
                files: allowAnonymousFiles,
                history: allowViewHistory
            )
        )
    }

    /// Le lien tel qu'il sera une fois `settings` enregistrés — la valeur
    /// optimiste que la fiche affiche avant la réponse du serveur.
    func applying(_ settings: ShareLinkSettings) -> MyShareLink {
        MyShareLink(
            id: id,
            linkId: linkId,
            identifier: identifier,
            name: settings.name.isEmpty ? nil : settings.name,
            isActive: isActive,
            currentUses: currentUses,
            maxUses: settings.maxUses,
            expiresAt: settings.expiresAt,
            createdAt: createdAt,
            conversationTitle: conversationTitle,
            description: settings.description.isEmpty ? nil : settings.description,
            maxConcurrentUsers: settings.maxConcurrentUsers,
            currentConcurrentUsers: currentConcurrentUsers,
            allowAnonymousMessages: settings.guestRights.messages,
            allowAnonymousFiles: settings.guestRights.files,
            allowAnonymousImages: settings.guestRights.images,
            allowViewHistory: settings.guestRights.history,
            requireAccount: settings.requireAccount,
            requireNickname: settings.requireNickname,
            requireEmail: settings.requireEmail,
            requireBirthday: settings.requireBirthday,
            allowedLanguages: settings.allowedLanguages,
            conversation: conversation
        )
    }

    func withActive(_ active: Bool) -> MyShareLink {
        MyShareLink(
            id: id, linkId: linkId, identifier: identifier, name: name,
            isActive: active, currentUses: currentUses, maxUses: maxUses,
            expiresAt: expiresAt, createdAt: createdAt, conversationTitle: conversationTitle,
            description: description, maxConcurrentUsers: maxConcurrentUsers,
            currentConcurrentUsers: currentConcurrentUsers,
            allowAnonymousMessages: allowAnonymousMessages, allowAnonymousFiles: allowAnonymousFiles,
            allowAnonymousImages: allowAnonymousImages, allowViewHistory: allowViewHistory,
            requireAccount: requireAccount, requireNickname: requireNickname,
            requireEmail: requireEmail, requireBirthday: requireBirthday,
            allowedLanguages: allowedLanguages, conversation: conversation
        )
    }
}

// MARK: - PATCH body

/// Le corps de `PATCH /links/:linkId`. Il porte la configuration ENTIÈRE, et
/// écrit `null` explicitement là où une limite est levée : un champ omis ne
/// change rien côté passerelle (`!== undefined`), donc omettre `maxUses`
/// pour dire « illimité » laisserait l'ancienne limite en place.
public struct UpdateShareLinkRequest: Encodable, Sendable {
    public let settings: ShareLinkSettings

    public init(settings: ShareLinkSettings) {
        self.settings = settings
    }

    enum CodingKeys: String, CodingKey {
        case name, description, expiresAt, maxUses, maxConcurrentUsers
        case requireAccount, requireNickname, requireEmail, requireBirthday
        case allowedLanguages
        case allowAnonymousMessages, allowAnonymousImages, allowAnonymousFiles, allowViewHistory
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(settings.name, forKey: .name)
        try c.encode(settings.description, forKey: .description)
        try c.encode(settings.expiresAt.map { WireDate.string(from: $0) }, forKey: .expiresAt)
        try c.encode(settings.maxUses, forKey: .maxUses)
        try c.encode(settings.maxConcurrentUsers, forKey: .maxConcurrentUsers)
        try c.encode(settings.requireAccount, forKey: .requireAccount)
        try c.encode(settings.requireNickname, forKey: .requireNickname)
        try c.encode(settings.requireEmail, forKey: .requireEmail)
        try c.encode(settings.requireBirthday, forKey: .requireBirthday)
        try c.encode(settings.allowedLanguages, forKey: .allowedLanguages)
        try c.encode(settings.guestRights.messages, forKey: .allowAnonymousMessages)
        try c.encode(settings.guestRights.images, forKey: .allowAnonymousImages)
        try c.encode(settings.guestRights.files, forKey: .allowAnonymousFiles)
        try c.encode(settings.guestRights.history, forKey: .allowViewHistory)
    }
}
