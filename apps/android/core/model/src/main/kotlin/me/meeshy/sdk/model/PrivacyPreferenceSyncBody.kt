package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The wire body for `PATCH /me/preferences/privacy` (feature-parity §L).
 *
 * Projected from the device-local [PrivacyPreferences] block by [from], this carries the
 * **twelve editable privacy booleans** the user can change on Android — the set catalogued by
 * [PrivacyCatalog] — plus [notifyContactsOnReturn] (#8285), all under the CANONICAL gateway keys
 * (`acceptCallsFromNonContacts`, #8073 — never the dead alias `allowCallsFromNonContacts` the
 * gateway no longer reads). It deliberately **omits the encryption leg** (`encryptionPreference`,
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
 *
 * The two keys this lot introduced ([acceptCallsFromNonContacts], [notifyContactsOnReturn]) are
 * nullable and `null` means "say nothing", because the same class decodes two things that predate
 * them: an outbox row queued by an earlier build (which carries the dead alias and neither key) and
 * a gateway response that does not hold them yet. Replaying the row must not invent a `true` over
 * what the user closed on another device, and reading the response must not reset what this device
 * holds ([toPreferences] keeps the local value). [from] always fills both, so a body built from the
 * local block never leaves them out — `encodeDefaults` or not, a non-null value is not the default.
 */
@Serializable
public data class PrivacyPreferenceSyncBody(
    val showOnlineStatus: Boolean,
    val showLastSeen: Boolean,
    val showReadReceipts: Boolean,
    val showTypingIndicator: Boolean,
    val hideProfileFromSearch: Boolean,
    val notifyContactsOnReturn: Boolean? = null,
    val allowContactRequests: Boolean,
    val allowGroupInvites: Boolean,
    val acceptCallsFromNonContacts: Boolean? = null,
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
     * encryption leg, and the local-only `extras`, on every broadcast. Only the editable
     * toggles come from the wire — and a toggle the response does not carry keeps its local
     * value.
     */
    public fun toPreferences(current: PrivacyPreferences): PrivacyPreferences =
        current.copy(
            showOnlineStatus = showOnlineStatus,
            showLastSeen = showLastSeen,
            showReadReceipts = showReadReceipts,
            showTypingIndicator = showTypingIndicator,
            hideProfileFromSearch = hideProfileFromSearch,
            notifyContactsOnReturn = notifyContactsOnReturn ?: current.notifyContactsOnReturn,
            allowContactRequests = allowContactRequests,
            allowGroupInvites = allowGroupInvites,
            acceptCallsFromNonContacts = acceptCallsFromNonContacts ?: current.acceptCallsFromNonContacts,
            saveMediaToGallery = saveMediaToGallery,
            allowAnalytics = allowAnalytics,
            shareUsageData = shareUsageData,
            blockScreenshots = blockScreenshots,
        )

    public companion object {
        /**
         * Projects the device-local block into the gateway wire body — the editable toggles only
         * (drops the read-only encryption leg and `extras`).
         */
        public fun from(prefs: PrivacyPreferences): PrivacyPreferenceSyncBody =
            PrivacyPreferenceSyncBody(
                showOnlineStatus = prefs.showOnlineStatus,
                showLastSeen = prefs.showLastSeen,
                showReadReceipts = prefs.showReadReceipts,
                showTypingIndicator = prefs.showTypingIndicator,
                hideProfileFromSearch = prefs.hideProfileFromSearch,
                notifyContactsOnReturn = prefs.notifyContactsOnReturn,
                allowContactRequests = prefs.allowContactRequests,
                allowGroupInvites = prefs.allowGroupInvites,
                acceptCallsFromNonContacts = prefs.acceptCallsFromNonContacts,
                saveMediaToGallery = prefs.saveMediaToGallery,
                allowAnalytics = prefs.allowAnalytics,
                shareUsageData = prefs.shareUsageData,
                blockScreenshots = prefs.blockScreenshots,
            )
    }
}
