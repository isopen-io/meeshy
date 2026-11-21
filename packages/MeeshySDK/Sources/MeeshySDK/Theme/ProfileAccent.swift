import Foundation

/// LA COULEUR D'ACCENT DE LA VITRINE, choisie par la personne (#19201, iOS #19391) — miroir de
/// `packages/shared/utils/profile-accent.ts`, toute évolution de la liste touche les deux.
///
/// Une liste FERMÉE, celle des pastilles de la planche `Moi-Edition` : jamais un hex quelconque. Une valeur absente,
/// `null` ou hors liste veut dire « automatique » : l'accent se CALCULE comme avant
/// (`DynamicColorGenerator.profileAccentHex`). Un serveur qui ne sert pas encore le champ ne change donc rien.
public enum ProfileAccent {

    /// Une teinte de la liste : `key` la nomme (et choisit son libellé), `wire` est la forme que la passerelle
    /// accepte et sert (`#RRGGBB`, majuscules).
    public struct Tone: Sendable, Hashable, Identifiable {
        public let key: String
        public let wire: String

        public var id: String { key }

        /// La forme des hex calculés (`A855F7`, sans dièse) : un accent choisi et un accent calculé ont la même forme.
        public var bareHex: String { String(wire.dropFirst()) }
    }

    /// Dans l'ordre de la planche : Violet, Turquoise, Corail, Ambre, Bleu, Vert, Framboise.
    public static let tones: [Tone] = [
        Tone(key: "violet", wire: "#A855F7"),
        Tone(key: "turquoise", wire: "#4ECDC4"),
        Tone(key: "coral", wire: "#FF6B6B"),
        Tone(key: "amber", wire: "#F8B500"),
        Tone(key: "blue", wire: "#3498DB"),
        Tone(key: "green", wire: "#2ECC71"),
        Tone(key: "raspberry", wire: "#FF2E63"),
    ]

    /// La teinte de la liste qu'une valeur servie désigne, casse et espaces ignorés ; `nil` hors liste.
    public static func tone(wire: String?) -> Tone? {
        guard let wire else { return nil }
        let canonical = wire.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return tones.first { $0.wire == canonical }
    }

    /// L'accent d'un profil : la teinte CHOISIE si elle est servie et lisible, sinon l'accent calculé.
    public static func hex(chosen: String?, userId: String?, name: String) -> String {
        tone(wire: chosen)?.bareHex ?? DynamicColorGenerator.profileAccentHex(userId: userId, name: name)
    }
}

/// Le choix fait en édition : une teinte de la liste, ou « automatique ». Il part tel quel dans le `PATCH /users/me` :
/// la teinte en `#RRGGBB`, l'automatique en `null` (la passerelle remet alors l'accent calculé).
public enum ProfileAccentChoice: Sendable, Hashable, Encodable {
    case automatic
    case tone(ProfileAccent.Tone)

    /// Une valeur servie illisible ou absente vaut « automatique ».
    public init(wire: String?) {
        if let tone = ProfileAccent.tone(wire: wire) {
            self = .tone(tone)
        } else {
            self = .automatic
        }
    }

    /// Ce que le compte garde : la teinte, ou `nil` pour l'automatique.
    public var wire: String? {
        guard case .tone(let tone) = self else { return nil }
        return tone.wire
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .automatic: try container.encodeNil()
        case .tone(let tone): try container.encode(tone.wire)
        }
    }
}

/// Clé absente contre clé à `null` sur un événement (`user:updated`, `profile:updated`) : une clé absente ne touche
/// pas l'accent tenu, une clé à `null` le remet à « automatique ».
public enum ProfileAccentChange: Sendable, Hashable {
    case unchanged
    case replaced(String?)

    public func applied(to current: String?) -> String? {
        switch self {
        case .unchanged: return current
        case .replaced(let wire): return ProfileAccent.tone(wire: wire)?.wire
        }
    }

    /// Lu d'un conteneur d'événement : `.unchanged` sans la clé ; une valeur illisible vaut `null` (automatique).
    static func decode<Key: CodingKey>(from container: KeyedDecodingContainer<Key>, forKey key: Key) -> ProfileAccentChange {
        guard container.contains(key) else { return .unchanged }
        return .replaced(try? container.decodeIfPresent(String.self, forKey: key))
    }
}

extension MeeshyUser {

    /// La teinte que la personne a choisie, si le serveur la sert ; `nil` = automatique.
    public var chosenAccent: ProfileAccent.Tone? { ProfileAccent.tone(wire: profileAccentColor) }

    /// Une réponse de MOI qui ne porte pas d'accent (téléversement d'une photo, ancienne passerelle) garde celui que
    /// je tiens : sans cela, changer ma photo repeindrait ma vitrine de la couleur calculée.
    public func carryingProfileAccent(from local: MeeshyUser?) -> MeeshyUser {
        guard profileAccentColor == nil, let local, local.id == id, let held = local.profileAccentColor else { return self }
        return withProfileAccent(held)
    }

    /// Le même compte avec un autre accent choisi (édition optimiste, événement) : tout le reste est porté.
    public func withProfileAccent(_ wire: String?) -> MeeshyUser {
        MeeshyUser(
            id: id, username: username, email: email,
            firstName: firstName, lastName: lastName,
            displayName: displayName, bio: bio,
            avatar: avatar, avatarThumbHash: avatarThumbHash,
            banner: banner, bannerThumbHash: bannerThumbHash,
            role: role,
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive, deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous, isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            deviceLocale: deviceLocale,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            voicePublic: voicePublic,
            voiceSampleUrl: voiceSampleUrl,
            voiceSampleDurationMs: voiceSampleDurationMs,
            voiceQuality: voiceQuality,
            activation: activation,
            profileDecor: profileDecor,
            addresses: addresses,
            city: city, cityCircle: cityCircle,
            profileAccentColor: ProfileAccent.tone(wire: wire)?.wire
        )
    }
}
