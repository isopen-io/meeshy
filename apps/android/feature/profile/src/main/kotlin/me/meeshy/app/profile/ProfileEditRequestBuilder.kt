package me.meeshy.app.profile

import me.meeshy.sdk.model.UpdateProfileRequest

/**
 * Projects the raw profile-editor buffers into an [UpdateProfileRequest].
 *
 * Text fields are trimmed and a blank buffer degrades to `null` (an absent field):
 * because the gateway `PATCH /users/me` omits null fields, a blank edit is a
 * server-side no-op — never an accidental clear of a name or bio. Language codes
 * are likewise trimmed and blank→null, so leaving a picker untouched sends nothing
 * for it. This is the tested SSOT the ViewModel delegates its save-request assembly
 * to, keeping the trim/blank rules out of the Composable and the ViewModel.
 */
object ProfileEditRequestBuilder {

    fun build(
        firstName: String,
        lastName: String,
        displayName: String,
        bio: String,
        systemLanguage: String?,
        regionalLanguage: String?,
        customDestinationLanguage: String?,
    ): UpdateProfileRequest = UpdateProfileRequest(
        firstName = firstName.blankToNull(),
        lastName = lastName.blankToNull(),
        displayName = displayName.blankToNull(),
        bio = bio.blankToNull(),
        systemLanguage = systemLanguage.normalizedCode(),
        regionalLanguage = regionalLanguage.normalizedCode(),
        customDestinationLanguage = customDestinationLanguage.normalizedCode(),
    )

    private fun String.blankToNull(): String? = trim().takeIf { it.isNotEmpty() }

    private fun String?.normalizedCode(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
