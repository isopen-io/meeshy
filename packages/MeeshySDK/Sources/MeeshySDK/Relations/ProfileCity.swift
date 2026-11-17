import Foundation

/// LA VILLE DÉCLARÉE (#18862, chantier #18857) — miroir de `packages/shared/utils/profile-city.ts`.
///
/// Un mot (« Dakar »), jamais une position. Son propriétaire choisit le cercle à partir duquel elle se lit ; tant qu'il
/// n'a pas choisi, elle ne se lit que de lui. Un cercle illisible FERME : jamais `public` par défaut, contrairement à
/// `RelationLevel(wire:)`, car ce serait ouvrir une donnée personnelle sur une valeur corrompue.
public enum ProfileCity {

    /// `CITY_MAX_LENGTH` de la passerelle : au-delà, le `PATCH /users/me` refuse.
    public static let maxLength = 80

    /// Rognée ; vide ou absente = aucune ville.
    public static func normalized(_ raw: String?) -> String? {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Le cercle servi, lu EXACTEMENT : une valeur inconnue (`ATOM`, une faute, un serveur plus récent) n'est aucun
    /// cercle, donc ma ville ne se lit que de moi.
    public static func circle(wire: String?) -> RelationLevel? {
        wire.flatMap(RelationLevel.init(rawValue:))
    }

    /// Ce qu'un lecteur du cercle `level` lit de ma ville (« Voir comme ») : la ville si mon cercle choisi l'ouvre à
    /// ce niveau, rien sinon — et rien tant que je n'ai choisi aucun cercle.
    public static func seen(city: String?, circle: String?, by level: RelationLevel) -> String? {
        guard let city = normalized(city), let floor = Self.circle(wire: circle) else { return nil }
        return level >= floor ? city : nil
    }
}

extension MeeshyUser {

    /// La ville que la fiche affiche : celle que le serveur m'a servie, rognée ; `nil` = rien à dire.
    public var declaredCity: String? { ProfileCity.normalized(city) }

    /// Le cercle qui lit ma ville, lu exactement ; `nil` = moi seul.
    public var declaredCityCircle: RelationLevel? { ProfileCity.circle(wire: cityCircle) }

    /// Le même compte avec une autre ville et un autre cercle (édition optimiste) : tout le reste est porté.
    public func withDeclaredCity(_ city: String?, circle: RelationLevel?) -> MeeshyUser {
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
            city: ProfileCity.normalized(city), cityCircle: circle?.rawValue
        )
    }

    /// Une réponse de MOI qui ne porte ni ville ni cercle (`/auth/me`, rafraîchissement de jeton — ces routes ne les
    /// servent pas encore) garde ceux que je tiens : sans cela, chaque revalidation effacerait ma ville à l'écran.
    public func carryingDeclaredCity(from local: MeeshyUser?) -> MeeshyUser {
        guard city == nil, cityCircle == nil, let local, local.id == id,
              local.city != nil || local.cityCircle != nil else { return self }
        return withDeclaredCity(local.city, circle: local.declaredCityCircle)
    }
}
