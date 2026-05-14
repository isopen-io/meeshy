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
            signalIdentityKeyPublic: signalIdentityKeyPublic
        )
    }
}
