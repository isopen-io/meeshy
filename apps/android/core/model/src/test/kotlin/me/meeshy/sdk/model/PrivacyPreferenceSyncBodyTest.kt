package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * The wire body sent to `PATCH /me/preferences/privacy` is projected from the device-local
 * [PrivacyPreferences] block by [PrivacyPreferenceSyncBody.from]. It carries the twelve editable
 * privacy booleans (the [PrivacyCatalog] set) plus `notifyContactsOnReturn` (#8285), under the
 * CANONICAL gateway keys — `acceptCallsFromNonContacts`, never the dead alias
 * `allowCallsFromNonContacts` the gateway no longer reads (#8073). Because the gateway PATCH is a
 * partial merge and the encryption leg renders read-only on Android, it must **never** carry the
 * encryption fields nor the local-only `extras` map, so a sync leaves the server's encryption
 * preferences untouched.
 */
class PrivacyPreferenceSyncBodyTest {

    private val json = Json { encodeDefaults = true }

    /** The exact editable field set the gateway privacy schema accepts from Android (13 fields). */
    private val editableFields = setOf(
        "showOnlineStatus", "showLastSeen", "showReadReceipts", "showTypingIndicator",
        "hideProfileFromSearch", "notifyContactsOnReturn", "allowContactRequests", "allowGroupInvites",
        "acceptCallsFromNonContacts", "saveMediaToGallery", "allowAnalytics",
        "shareUsageData", "blockScreenshots",
    )

    /** The wire config of `MeeshyApi.json` (outbox payload and PATCH body): defaults NOT encoded. */
    private val wire = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

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
            acceptCallsFromNonContacts = false,
            notifyContactsOnReturn = false,
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
        assertThat(body.acceptCallsFromNonContacts).isFalse()
        assertThat(body.notifyContactsOnReturn).isFalse()
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
        // « Appels hors contacts » et « prévenir mes contacts » sont OPT-OUT : vrais par défaut.
        assertThat(body.acceptCallsFromNonContacts).isTrue()
        assertThat(body.notifyContactsOnReturn).isTrue()
        // Defaults that intentionally diverge to false survive the projection
        // #4578 — `allowAnalytics` a REJOINT ce groupe : gardée par un
        // consentement et sans lecteur d'usage, elle ne peut pas valoir `true`
        // par défaut sans que l'état initial du système contredise sa garde.
        assertThat(body.allowAnalytics).isFalse()
        assertThat(body.saveMediaToGallery).isFalse()
        assertThat(body.shareUsageData).isFalse()
        assertThat(body.blockScreenshots).isFalse()
        assertThat(body.hideProfileFromSearch).isFalse()
    }

    @Test
    fun `the canonical calls key goes on the wire and the dead alias never does`() {
        val closed = PrivacyPreferences(acceptCallsFromNonContacts = false)

        val obj = wire.encodeToString(PrivacyPreferenceSyncBody.from(closed)).let {
            Json.parseToJsonElement(it).jsonObject
        }

        assertThat(obj["acceptCallsFromNonContacts"]!!.jsonPrimitive.content).isEqualTo("false")
        assertThat(obj.keys).doesNotContain("allowCallsFromNonContacts")
    }

    /**
     * `MeeshyApi.json` has `encodeDefaults = false`, and an opt-OUT switch turned back ON is
     * the value the body would be tempted to drop as a "default". Dropped, the PATCH would
     * leave the server closed while the screen reads open: the canonical keys must ride the
     * wire whatever their value.
     */
    @Test
    fun `an open calls switch still rides the wire when defaults are not encoded`() {
        val obj = wire.encodeToString(PrivacyPreferenceSyncBody.from(PrivacyPreferences())).let {
            Json.parseToJsonElement(it).jsonObject
        }

        assertThat(obj.keys).isEqualTo(editableFields)
        assertThat(obj["acceptCallsFromNonContacts"]!!.jsonPrimitive.content).isEqualTo("true")
        assertThat(obj["notifyContactsOnReturn"]!!.jsonPrimitive.content).isEqualTo("true")
    }

    /**
     * An outbox row queued BEFORE this lot carries the dead alias and not the canonical key.
     * Replaying it must not invent a `true` over a value the user may have closed on iOS: the
     * canonical keys it never carried stay off the wire.
     */
    @Test
    fun `a row queued before the canonical keys replays without inventing them`() {
        val legacyPayload = """
            {"showOnlineStatus":false,"showLastSeen":true,"showReadReceipts":true,
             "showTypingIndicator":true,"hideProfileFromSearch":false,"allowContactRequests":true,
             "allowGroupInvites":true,"allowCallsFromNonContacts":false,"saveMediaToGallery":false,
             "allowAnalytics":false,"shareUsageData":false,"blockScreenshots":false}
        """.trimIndent()

        val replayed = wire.decodeFromString<PrivacyPreferenceSyncBody>(legacyPayload)
        val obj = wire.encodeToString(replayed).let { Json.parseToJsonElement(it).jsonObject }

        assertThat(replayed.showOnlineStatus).isFalse()
        assertThat(obj.keys).doesNotContain("acceptCallsFromNonContacts")
        assertThat(obj.keys).doesNotContain("notifyContactsOnReturn")
        assertThat(obj.keys).doesNotContain("allowCallsFromNonContacts")
    }
}
