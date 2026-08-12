package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Test

/**
 * The wire body sent to `PATCH /me/preferences/privacy` is projected from the device-local
 * [PrivacyPreferences] block by [PrivacyPreferenceSyncBody.from]. It carries exactly the twelve
 * editable privacy booleans (the [PrivacyCatalog] set) and — because the gateway PATCH is a
 * partial merge and the encryption leg renders read-only on Android — it must **never** carry the
 * encryption fields nor the local-only `extras` map, so a sync leaves the server's encryption
 * preferences untouched.
 */
class PrivacyPreferenceSyncBodyTest {

    private val json = Json { encodeDefaults = true }

    /** The exact editable field set the gateway privacy schema accepts from Android (12 fields). */
    private val editableFields = setOf(
        "showOnlineStatus", "showLastSeen", "showReadReceipts", "showTypingIndicator",
        "hideProfileFromSearch", "allowContactRequests", "allowGroupInvites",
        "allowCallsFromNonContacts", "saveMediaToGallery", "allowAnalytics",
        "shareUsageData", "blockScreenshots",
    )

    @Test
    fun `from projects each editable toggle to its own field`() {
        // A distinctive per-field pattern guards against a copy-paste field swap in the projection.
        val prefs = PrivacyPreferences(
            showOnlineStatus = false,
            showLastSeen = true,
            showReadReceipts = false,
            showTypingIndicator = true,
            hideProfileFromSearch = true,
            allowContactRequests = false,
            allowGroupInvites = true,
            allowCallsFromNonContacts = true,
            saveMediaToGallery = true,
            allowAnalytics = false,
            shareUsageData = true,
            blockScreenshots = true,
        )

        val body = PrivacyPreferenceSyncBody.from(prefs)

        assertThat(body.showOnlineStatus).isFalse()
        assertThat(body.showLastSeen).isTrue()
        assertThat(body.showReadReceipts).isFalse()
        assertThat(body.showTypingIndicator).isTrue()
        assertThat(body.hideProfileFromSearch).isTrue()
        assertThat(body.allowContactRequests).isFalse()
        assertThat(body.allowGroupInvites).isTrue()
        assertThat(body.allowCallsFromNonContacts).isTrue()
        assertThat(body.saveMediaToGallery).isTrue()
        assertThat(body.allowAnalytics).isFalse()
        assertThat(body.shareUsageData).isTrue()
        assertThat(body.blockScreenshots).isTrue()
    }

    @Test
    fun `the serialized body carries exactly the editable fields and never the encryption leg or extras`() {
        // Encryption fields set to non-defaults: proving they are dropped, not merely defaulted.
        val prefs = PrivacyPreferences(
            encryptionPreference = EncryptionPreference.ALWAYS,
            autoEncryptNewConversations = true,
            showEncryptionStatus = false,
            warnOnUnencrypted = true,
        )

        val obj = json.encodeToString(PrivacyPreferenceSyncBody.from(prefs)).let {
            Json.parseToJsonElement(it).jsonObject
        }

        assertThat(obj.keys).isEqualTo(editableFields)
        assertThat(obj.keys).doesNotContain("encryptionPreference")
        assertThat(obj.keys).doesNotContain("autoEncryptNewConversations")
        assertThat(obj.keys).doesNotContain("showEncryptionStatus")
        assertThat(obj.keys).doesNotContain("warnOnUnencrypted")
        assertThat(obj.keys).doesNotContain("extras")
    }

    @Test
    fun `an all-default block projects the default values`() {
        val body = PrivacyPreferenceSyncBody.from(PrivacyPreferences())

        // Defaults that are true
        assertThat(body.showOnlineStatus).isTrue()
        assertThat(body.showLastSeen).isTrue()
        assertThat(body.allowContactRequests).isTrue()
        assertThat(body.allowAnalytics).isTrue()
        // Defaults that intentionally diverge to false survive the projection
        assertThat(body.allowCallsFromNonContacts).isFalse()
        assertThat(body.saveMediaToGallery).isFalse()
        assertThat(body.shareUsageData).isFalse()
        assertThat(body.blockScreenshots).isFalse()
        assertThat(body.hideProfileFromSearch).isFalse()
    }
}
