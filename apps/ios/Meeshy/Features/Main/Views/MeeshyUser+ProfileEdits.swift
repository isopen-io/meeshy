import MeeshySDK

// MARK: - Optimistic Profile Builder

extension MeeshyUser {
    /// Returns a copy with the supplied fields overridden. Used by the
    /// profile editor to apply optimistic local updates before the server
    /// response lands. Only fields that the editor can touch are exposed;
    /// everything else is carried over verbatim — which means every stored
    /// property must appear in the `MeeshyUser(...)` call below: an omitted
    /// argument takes the `= nil` default of `MeeshyUser.init` and ERASES the
    /// field instead of carrying it (that is how the thumb hashes, the device
    /// locale and the whole voice profile used to be wiped by a bio edit).
    ///
    /// Non-`private` (like `ProfileView.changedOrNil`) so the carry-over
    /// contract can be exercised from `MeeshyTests` via `@testable import
    /// Meeshy` without instantiating the SwiftUI view.
    func applyingProfileEdits(
        firstName: String? = nil,
        lastName: String? = nil,
        displayName: String? = nil,
        bio: String? = nil,
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil,
        customDestinationLanguage: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: username,
            email: email,
            firstName: firstName ?? self.firstName,
            lastName: lastName ?? self.lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar,
            avatarThumbHash: avatarThumbHash,
            banner: banner,
            bannerThumbHash: bannerThumbHash,
            role: role,
            systemLanguage: systemLanguage ?? self.systemLanguage,
            regionalLanguage: regionalLanguage ?? self.regionalLanguage,
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
            customDestinationLanguage: customDestinationLanguage ?? self.customDestinationLanguage,
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
            profileDecor: profileDecor
        )
    }
}
