import Foundation

/// **Mon profil se synchronise entre mes appareils** (#18924) : `profile:updated` projeté sur le compte connecté,
/// sans relecture réseau, quel que soit l'écran ouvert. Changer sa langue sur le web change le Prisme de l'iPhone
/// connecté à l'instant — `ReaderPrism.resolve(for:)` se relit des langues du compte —, au lieu d'attendre la
/// prochaine lecture de `GET /me`.
///
/// Miroir Swift de `ownProfileSnapshotIsStale` (`packages/shared/types/own-profile-sync.ts`) pour l'arbitrage par
/// `updatedAt` ; toute évolution de la règle touche les deux.
public enum OwnProfileSync {

    /// Un instantané est PÉRIMÉ quand son instant est STRICTEMENT antérieur à celui du profil tenu. On n'écarte que
    /// ce qu'on PROUVE plus ancien : rien de connu, ou un instant illisible, et il s'applique ; le même instant aussi
    /// — c'est l'écho de l'écriture sur l'appareil qui l'a faite.
    public static func isStale(knownUpdatedAt: String?, incomingUpdatedAt: String) -> Bool {
        guard let knownUpdatedAt, let known = WireDate.date(from: knownUpdatedAt),
              let incoming = WireDate.date(from: incomingUpdatedAt) else { return false }
        return incoming < known
    }

    /// Le compte `user` après l'instantané ; `nil` quand l'événement vise un autre compte, qu'il est périmé, ou
    /// qu'il ne change rien.
    public static func projected(_ user: MeeshyUser, applying event: ProfileUpdatedEvent) -> MeeshyUser? {
        guard user.id == event.userId,
              !isStale(knownUpdatedAt: user.updatedAt, incomingUpdatedAt: event.updatedAt) else { return nil }
        let next = user.withOwnProfile(event.profile, updatedAt: event.updatedAt)
        return next.holdsTheSameOwnProfile(as: user) ? nil : next
    }

    /// Appliqué au compte connecté, avec la règle de la revalidation (`updateUserAfterRevalidation`) : la session
    /// se garde au trousseau pour le démarrage à froid, et une modification optimiste encore en vol sur CET appareil
    /// n'est pas écrasée — elle se lève dès que l'instantané la porte.
    @MainActor
    public static func apply(_ event: ProfileUpdatedEvent, to auth: AuthManager) {
        guard let user = auth.currentUser, let repainted = Self.projected(user, applying: event) else { return }
        let resolved = AuthManager.resolveServerUserWithOptimistic(repainted, pending: auth.pendingOptimisticProfile)
        auth.currentUser = resolved.user
        auth.saveUserToKeychain(resolved.user, userId: resolved.user.id)
        guard resolved.clearedPending else { return }
        auth.pendingOptimisticProfile = nil
        auth.clearPendingProfileFromKeychain(userId: resolved.user.id)
    }
}

extension MeeshyUser {

    /// Le même compte avec les neuf champs de l'instantané et son instant. Une photo ou une bannière qui change
    /// perd l'empreinte floue de la précédente : elle peindrait l'ancienne image en attendant la nouvelle.
    func withOwnProfile(_ profile: OwnProfileSnapshot, updatedAt: String) -> MeeshyUser {
        MeeshyUser(
            id: id, username: profile.username, email: email,
            firstName: profile.firstName, lastName: profile.lastName,
            displayName: profile.displayName, bio: bio,
            avatar: profile.avatar, avatarThumbHash: profile.avatar == avatar ? avatarThumbHash : nil,
            banner: profile.banner, bannerThumbHash: profile.banner == banner ? bannerThumbHash : nil,
            role: role,
            systemLanguage: profile.systemLanguage, regionalLanguage: profile.regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive, deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous, isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: profile.customDestinationLanguage,
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
            city: city, cityCircle: cityCircle
        )
    }

    func holdsTheSameOwnProfile(as other: MeeshyUser) -> Bool {
        updatedAt == other.updatedAt
            && systemLanguage == other.systemLanguage && regionalLanguage == other.regionalLanguage
            && customDestinationLanguage == other.customDestinationLanguage
            && displayName == other.displayName && firstName == other.firstName && lastName == other.lastName
            && username == other.username && avatar == other.avatar && banner == other.banner
    }
}
