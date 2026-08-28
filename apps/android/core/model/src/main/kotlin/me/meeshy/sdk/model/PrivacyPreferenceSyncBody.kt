package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The wire body for `PATCH /me/preferences/privacy` (feature-parity §L).
 *
 * Projected from the device-local [PrivacyPreferences] block by [from], this carries exactly the
 * **twelve editable privacy booleans** the user can change on Android — the same set catalogued by
 * [PrivacyCatalog]. It deliberately **omits the encryption leg** (`encryptionPreference`,
 * `autoEncryptNewConversations`, `showEncryptionStatus`, `warnOnUnencrypted`) and the local-only
 * `extras` map:
 *
 *  - The encryption section renders **read-only / coming-soon** on Android (product decision
 *    2026-06-14), so the device never authoritatively edits it. The gateway PATCH is a partial
 *    merge (`{ ...current, ...body }`), and every field here is `@SerialName`-less camelCase that
 *    matches the gateway `PrivacyPreferenceSchema` key exactly — so a body that omits the
 *    encryption keys leaves the server's encryption preferences untouched instead of silently
 *    stamping the device defaults over a value the user may have set on web/iOS.
 *  - `extras` is a device-side extension that must never leak to the backend.
 *
 * Serialised with `encodeDefaults`, it is both the durable outbox payload and the request body, so
 * the enqueued snapshot and the delivered PATCH are byte-identical.
 */
@Serializable
public data class PrivacyPreferenceSyncBody(
    val showOnlineStatus: Boolean,
    val showLastSeen: Boolean,
    val showReadReceipts: Boolean,
    val showTypingIndicator: Boolean,
    val hideProfileFromSearch: Boolean,
    val allowContactRequests: Boolean,
    val allowGroupInvites: Boolean,
    val allowCallsFromNonContacts: Boolean,
    val saveMediaToGallery: Boolean,
    val allowAnalytics: Boolean,
    val shareUsageData: Boolean,
    val blockScreenshots: Boolean,
) {
    /**
     * Projects the gateway block BACK onto the device-local one — the read half of [from],
     * used when `user:preferences-updated` (category scope) says another device changed this
     * block and the store has to catch up (issue #4133).
     *
     * [current] carries what this body deliberately does not, and the asymmetry is the whole
     * point: the write side omits the four encryption fields precisely so a device sync never
     * stamps its defaults over a value set on web or iOS. A read that rebuilt the block from
     * the response alone would do exactly that damage in the other direction — reset the
     * encryption leg, and the local-only `extras`, on every broadcast. Only the twelve
     * editable toggles come from the wire.
     */
    public fun toPreferences(current: PrivacyPreferences): PrivacyPreferences =
        current.copy(
            showOnlineStatus = showOnlineStatus,
            showLastSeen = showLastSeen,
            showReadReceipts = showReadReceipts,
            showTypingIndicator = showTypingIndicator,
            hideProfileFromSearch = hideProfileFromSearch,
            allowContactRequests = allowContactRequests,
            allowGroupInvites = allowGroupInvites,
            allowCallsFromNonContacts = allowCallsFromNonContacts,
            saveMediaToGallery = saveMediaToGallery,
            allowAnalytics = allowAnalytics,
            shareUsageData = shareUsageData,
            blockScreenshots = blockScreenshots,
        )

    public companion object {
        /**
         * Projects the device-local block into the gateway wire body — the twelve editable toggles
         * only (drops the read-only encryption leg and `extras`).
         */
        public fun from(prefs: PrivacyPreferences): PrivacyPreferenceSyncBody =
            PrivacyPreferenceSyncBody(
                showOnlineStatus = prefs.showOnlineStatus,
                showLastSeen = prefs.showLastSeen,
                showReadReceipts = prefs.showReadReceipts,
                showTypingIndicator = prefs.showTypingIndicator,
                hideProfileFromSearch = prefs.hideProfileFromSearch,
                allowContactRequests = prefs.allowContactRequests,
                allowGroupInvites = prefs.allowGroupInvites,
                allowCallsFromNonContacts = prefs.allowCallsFromNonContacts,
                saveMediaToGallery = prefs.saveMediaToGallery,
                allowAnalytics = prefs.allowAnalytics,
                shareUsageData = prefs.shareUsageData,
                blockScreenshots = prefs.blockScreenshots,
            )
    }
}
