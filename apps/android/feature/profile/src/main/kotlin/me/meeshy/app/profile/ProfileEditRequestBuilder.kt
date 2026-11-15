package me.meeshy.app.profile

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.profile.ProfileEditBuffers
import me.meeshy.sdk.model.profile.ProfileEditDiff

/**
 * Projects the profile-editor buffers into an [UpdateProfileRequest] that carries ONLY what changed
 * against [original] — the identity the editor opened on (iOS `ProfileView.changedOrNil`).
 *
 * A field identical to the original is omitted, an emptied bio / regional language / custom
 * language is sent as `""` (a real clear), an emptied name or primary language stays omitted. The
 * law lives in [ProfileEditDiff] (`:core:model`); this is the screen's thin adapter onto it.
 */
object ProfileEditRequestBuilder {

    fun build(
        original: MeeshyUser?,
        firstName: String,
        lastName: String,
        displayName: String,
        bio: String,
        systemLanguage: String,
        regionalLanguage: String,
        customDestinationLanguage: String,
    ): UpdateProfileRequest = ProfileEditDiff.request(
        original = original,
        buffers = ProfileEditBuffers(
            firstName = firstName,
            lastName = lastName,
            displayName = displayName,
            bio = bio,
            systemLanguage = systemLanguage,
            regionalLanguage = regionalLanguage,
            customDestinationLanguage = customDestinationLanguage,
        ),
    )
}
