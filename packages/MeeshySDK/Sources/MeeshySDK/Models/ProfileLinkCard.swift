import Foundation

/// La carte du LECTEUR pour le lien d'une fiche collé dans un message (#18865, iOS #19519), telle que
/// `GET /directory/people/:handle?via=link&expand=presence` la sert : rien de plus que ce que la porte de la fiche
/// ouvre à son cercle.
///
/// Une PROJECTION, pas un `MeeshyUser` : la bulle ne garde que ce qu'elle rend, et la carte se compare.
public struct ProfileLinkCard: Decodable, Sendable, Equatable {
    public let userId: String
    public let username: String
    public let name: String
    public let avatarURL: String?
    public let avatarThumbHash: String?
    public let bio: String?
    /// La teinte CHOISIE de la vitrine (#19201), déjà validée contre `ProfileAccent.tones` ; `nil` = calculée.
    public let profileAccentColor: String?
    /// La présence SERVIE (`?expand=presence`, sous la loi de visibilité) ; `nil` = aucun point.
    public let isOnline: Bool?
    public let isSelf: Bool
    /// La langue de la bio et ses traductions (#19518) ; absentes ⇒ la bio se lit dans sa langue, sans marque.
    public let bioOriginalLanguage: String?
    public let bioTranslations: [String: String]

    private enum CodingKeys: String, CodingKey {
        case isSelf, bioOriginalLanguage, bioTranslations
    }

    public init(from decoder: Decoder) throws {
        let user = try MeeshyUser(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            userId: user.id, username: user.username,
            name: Self.name(displayName: user.displayName, firstName: user.firstName, lastName: user.lastName,
                            username: user.username),
            avatarURL: user.avatar, avatarThumbHash: user.avatarThumbHash, bio: user.bio,
            profileAccentColor: ProfileAccent.tone(wire: user.profileAccentColor)?.wire,
            isOnline: user.isOnline,
            isSelf: (try? container.decodeIfPresent(Bool.self, forKey: .isSelf)) ?? false,
            bioOriginalLanguage: try? container.decodeIfPresent(String.self, forKey: .bioOriginalLanguage),
            bioTranslations: (try? container.decodeIfPresent([String: String].self, forKey: .bioTranslations)) ?? [:]
        )
    }

    public init(userId: String, username: String, name: String, avatarURL: String? = nil,
                avatarThumbHash: String? = nil, bio: String? = nil, profileAccentColor: String? = nil,
                isOnline: Bool? = nil, isSelf: Bool = false, bioOriginalLanguage: String? = nil,
                bioTranslations: [String: String] = [:]) {
        self.userId = userId
        self.username = username
        self.name = name
        self.avatarURL = avatarURL
        self.avatarThumbHash = avatarThumbHash
        self.bio = bio
        self.profileAccentColor = profileAccentColor
        self.isOnline = isOnline
        self.isSelf = isSelf
        self.bioOriginalLanguage = bioOriginalLanguage
        self.bioTranslations = bioTranslations
    }

    /// Un nom d'affichage vide ou blanc n'en est pas un : le prénom et le nom, sinon le pseudo.
    static func name(displayName: String?, firstName: String?, lastName: String?, username: String) -> String {
        let display = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !display.isEmpty { return display }
        let full = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return full.isEmpty ? username : full
    }

    /// La bio que CE lecteur lit : le Prisme descendu dans l'ordre (la langue d'origine concourt à son rang,
    /// jamais en court-circuit) ; `nil` sans bio.
    public func servedBio(prism: [String]) -> ProfileLinkBio? {
        let original = bio?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !original.isEmpty else { return nil }
        return ProfileLinkBio(original: original, translation: translation(prism: prism))
    }

    private func translation(prism: [String]) -> ProfileLinkBio.Translation? {
        let source = bioOriginalLanguage?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard !source.isEmpty else { return nil }
        let texts = Dictionary(bioTranslations.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { first, _ in first })
        let served = prism.map { $0.lowercased() }.first { $0 == source || texts[$0] != nil }
        guard let served, served != source,
              let text = texts[served]?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty
        else { return nil }
        return ProfileLinkBio.Translation(originalLanguage: source, language: served, text: text)
    }
}

/// La bio d'une carte de lien : l'original, et la traduction servie au rang du lecteur s'il y en a une.
public struct ProfileLinkBio: Sendable, Equatable {
    public struct Translation: Sendable, Equatable {
        public let originalLanguage: String
        public let language: String
        public let text: String
    }

    public let original: String
    public let translation: Translation?

    /// Le texte lu : la traduction, ou l'original quand le lecteur l'a demandé ou qu'aucune n'est servie.
    public func text(showingOriginal: Bool) -> String {
        guard !showingOriginal, let translation else { return original }
        return translation.text
    }
}

/// Ce qu'un lien de fiche devient dans une bulle.
public enum ProfileLinkCardResolution: Sendable, Equatable {
    /// La carte du lecteur.
    case card(ProfileLinkCard)
    /// Inconnue, désactivée, cachée ou bloquée : la MÊME 404 qu'un pseudo inexistant — une carte neutre, rien
    /// de la personne ne fuit.
    case closed
    /// Le serveur n'a rien dit d'utile (panne, sans compte, ancienne passerelle) : l'aperçu générique d'avant.
    case unavailable
}
