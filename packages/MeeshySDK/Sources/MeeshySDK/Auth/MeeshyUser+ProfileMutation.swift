import Foundation

extension MeeshyUser {

    /// Returns a new `MeeshyUser` with the three profile-editable fields
    /// optionally overwritten. `nil` for any field means "leave unchanged"
    /// (aligned with `UpdateProfilePayload` PATCH semantics).
    ///
    /// All 27 other fields are copied verbatim via memberwise init —
    /// `MeeshyUser` is a struct with `let` fields, so this is the only
    /// way to "mutate" it.
    public func withProfileChanges(
        displayName: String?,
        bio: String?,
        avatar: String?
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: username,
            email: email,
            firstName: firstName,
            lastName: lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar ?? self.avatar,
            banner: banner,
            role: role,
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            isOnline: isOnline,
            lastActiveAt: lastActiveAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive,
            deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous,
            isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt,
            phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            activation: activation
        )
    }

    /// Retire un avatar ou une bannière servis en `data:` avant de persister
    /// l'utilisateur (Keychain) — extrait d'`AuthManager` (#8239) pour que ce
    /// relais champ par champ vive à côté des autres copies de `MeeshyUser`.
    public func droppingDataURIImages() -> MeeshyUser {
        let hasDataAvatar = avatar?.hasPrefix("data:") == true
        let hasDataBanner = banner?.hasPrefix("data:") == true
        guard hasDataAvatar || hasDataBanner else { return self }
        return MeeshyUser(
            id: id, username: username, email: email,
            firstName: firstName, lastName: lastName,
            displayName: displayName, bio: bio,
            avatar: hasDataAvatar ? nil : avatar,
            banner: hasDataBanner ? nil : banner,
            role: role, systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds, isActive: isActive,
            deactivatedAt: deactivatedAt, isAnonymous: isAnonymous,
            isMeeshyer: isMeeshyer, phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            timezone: timezone, registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            activation: activation
        )
    }
}
