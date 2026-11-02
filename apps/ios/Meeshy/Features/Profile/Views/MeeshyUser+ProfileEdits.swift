import Foundation
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

// MARK: - Profile Edit Rules

/// Les règles PURES de l'éditeur de profil : ce qui part, ce qui se fusionne,
/// ce qui se refuse avant l'envoi. Elles vivent à côté de
/// `applyingProfileEdits`, que l'éditeur applique avec elles.
extension ProfileView {
    /// Distinguishes "field untouched" (`nil` — omit from the request/optimistic
    /// merge so the prior value survives) from "field intentionally cleared"
    /// (empty string — sent verbatim instead of being collapsed to `nil` and
    /// silently dropped). Comparing against the pre-edit snapshot instead of
    /// `current.isEmpty` is what lets an already-empty field stay omitted (no
    /// spurious clear-of-nothing) while a genuine clear survives the round-trip.
    ///
    /// Only valid for fields the gateway's `updateUserProfileSchema` actually
    /// accepts an empty string for: `bio` (plain `z.string().max(500)`, no
    /// minimum), `customDestinationLanguage` (explicit `z.literal('')` union
    /// member) and `regionalLanguage` (now a `z.union([z.literal(''),
    /// supportedLanguageCode])` — the gateway maps `''` to `null` and the
    /// Prisme treats a cleared secondary language as absent).
    ///
    /// `static` + non-`private` (rather than an instance method) so it can be
    /// exercised directly from `MeeshyTests` via `@testable import Meeshy`
    /// without instantiating the SwiftUI view.
    static func changedOrNil(_ current: String, original: String?) -> String? {
        current == (original ?? "") ? nil : current
    }

    /// Merges a self-profile server response onto the local user instead of
    /// replacing it wholesale. No self-only gateway route can carry
    /// `voicePublic` — it lives on the `voiceModel` relation, which
    /// `formatUserResponse()` never joins — so assigning the response verbatim
    /// to `authManager.currentUser` blanks the flag and silently turns the
    /// public voice off in the UI.
    ///
    /// Only `voicePublic` is carried over. The other fields the response omits
    /// (blockedUserIds, deviceLocale, timezone, registrationCountry,
    /// signalIdentityKeyPublic, voiceSample*) are measured always-nil on
    /// `currentUser` today — the moment any of them becomes live server-side,
    /// it must be added HERE, not assumed handled. The server still wins when
    /// it does carry `voicePublic`.
    ///
    /// `static` + non-`private` (like `changedOrNil`) so it can be exercised
    /// directly from `MeeshyTests` via `@testable import Meeshy` without
    /// instantiating the SwiftUI view.
    static func mergingServerUser(_ server: MeeshyUser, onto local: MeeshyUser?) -> MeeshyUser {
        let decor = server.profileDecor ?? local?.profileDecor
        let merged = server.voicePublic == nil && local?.voicePublic != nil ? server.withProfileChanges(voicePublic: local?.voicePublic) : server
        return merged.profileDecor == decor ? merged : merged.withProfileDecor(decor)
    }

    /// Ce qui part pour un champ d'identité : la saisie ROGNÉE, ou `nil` quand
    /// elle est vide ou inchangée — une valeur héritée trop courte, que
    /// l'utilisateur ne touche pas, ne bloque pas un autre enregistrement.
    static func identityValueToSend(_ typed: String, original: String?) -> String? {
        let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return trimmed == original?.trimmingCharacters(in: .whitespacesAndNewlines) ? nil : trimmed
    }

    /// Le refus AVANT l'envoi : le premier champ d'identité modifié et sous sa
    /// borne (`IdentityRules`), nommé, avec le minimum de la copie existante.
    static func identityRefusalMessage(firstName: String?, lastName: String?, displayName: String?) -> String? {
        guard let field = IdentityRules
            .shortFields(firstName: firstName ?? "", lastName: lastName ?? "", displayName: displayName ?? "")
            .first
        else { return nil }
        let label: String
        switch field {
        case .firstName: label = String(localized: "profile.first_name", bundle: .main)
        case .lastName: label = String(localized: "profile.last_name", bundle: .main)
        case .displayName: label = String(localized: "profile.display_name", bundle: .main)
        case .pseudo: return SignupViewModel.minimumLengthMessage(for: field)
        }
        return "\(label) : \(SignupViewModel.minimumLengthMessage(for: field))"
    }
}
