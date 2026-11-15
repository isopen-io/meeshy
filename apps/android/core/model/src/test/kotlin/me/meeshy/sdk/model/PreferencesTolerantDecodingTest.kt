package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

/**
 * The tolerant block decoder (#11616) — what keeps ONE odd value from emptying a whole block.
 *
 * kotlinx fails on the DOCUMENT: a boolean field that arrives as a string, an enum token the
 * client does not know yet, a number where a string was expected, and the whole preference block
 * degrades to its defaults — every setting the user had made in that block, gone, for one field.
 * iOS decodes each field on its own (`decodeIfPresent(...) ?? defaults`); these witnesses pin the
 * same contract on Android: an absent or unexpected-typed field falls back to ITS OWN default,
 * its siblings survive, and a key the client does not know is kept in `extras` and written back
 * as it came.
 *
 * Every wrong-typed witness below is aimed at a field whose default is the OPPOSITE of the
 * value that would be wrongly coerced from it, so a decoder that read the garbage as `false`
 * (or `true`) cannot pass by luck.
 */
class PreferencesTolerantDecodingTest {

    private fun block(raw: String): JsonElement = Json.parseToJsonElement(raw)

    // ---- privacy ----

    @Test
    fun `a boolean carried as a string falls back to its default and spares its siblings`() {
        val decoded = privacyPreferencesFromJson(
            block("""{"showOnlineStatus":"false","blockScreenshots":true,"showLastSeen":false}"""),
        )

        assertThat(decoded.showOnlineStatus).isTrue()
        assertThat(decoded.blockScreenshots).isTrue()
        assertThat(decoded.showLastSeen).isFalse()
    }

    @Test
    fun `a boolean carried as a number or null falls back to its default`() {
        val decoded = privacyPreferencesFromJson(
            block("""{"acceptCallsFromNonContacts":0,"saveMediaToGallery":1,"showReadReceipts":null}"""),
        )

        assertThat(decoded.acceptCallsFromNonContacts).isTrue()
        assertThat(decoded.saveMediaToGallery).isFalse()
        assertThat(decoded.showReadReceipts).isTrue()
    }

    @Test
    fun `an enum token the client does not know falls back to the default`() {
        val decoded = privacyPreferencesFromJson(
            block("""{"encryptionPreference":"quantum","blockScreenshots":true}"""),
        )

        assertThat(decoded.encryptionPreference).isEqualTo(EncryptionPreference.OPTIONAL)
        assertThat(decoded.blockScreenshots).isTrue()
    }

    @Test
    fun `an enum token the client knows is read`() {
        val decoded = privacyPreferencesFromJson(block("""{"encryptionPreference":"always"}"""))

        assertThat(decoded.encryptionPreference).isEqualTo(EncryptionPreference.ALWAYS)
    }

    @Test
    fun `a block that is not an object is the defaults`() {
        assertThat(privacyPreferencesFromJson(block("[1,2]"))).isEqualTo(PrivacyPreferences())
        assertThat(privacyPreferencesFromJson(block("\"oops\""))).isEqualTo(PrivacyPreferences())
        assertThat(privacyPreferencesFromJson(null)).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun `the storage codec degrades field by field, not block by block`() {
        val decoded = privacyPreferencesFromStorage(
            """{"showOnlineStatus":false,"showLastSeen":"later","hideProfileFromSearch":true}""",
        )

        assertThat(decoded.showOnlineStatus).isFalse()
        assertThat(decoded.showLastSeen).isTrue()
        assertThat(decoded.hideProfileFromSearch).isTrue()
    }

    // ---- extras ----

    @Test
    fun `a key the client does not know is kept in extras`() {
        val decoded = privacyPreferencesFromJson(
            block("""{"showForwardSource":false,"futureObject":{"a":1},"blockScreenshots":true}"""),
        )

        assertThat(decoded.blockScreenshots).isTrue()
        assertThat(decoded.extras["showForwardSource"]).isEqualTo(JsonPrimitive(false))
        assertThat(decoded.extras["futureObject"]).isEqualTo(block("""{"a":1}"""))
    }

    @Test
    fun `the declared extras object and the unknown keys are merged`() {
        val decoded = privacyPreferencesFromJson(
            block("""{"extras":{"androidScreenshotGuard":true},"futureFlag":"x"}"""),
        )

        assertThat(decoded.extras).containsExactly(
            "androidScreenshotGuard", JsonPrimitive(true),
            "futureFlag", JsonPrimitive("x"),
        )
    }

    @Test
    fun `an extras entry that is not an object is ignored`() {
        val decoded = privacyPreferencesFromJson(block("""{"extras":"nope","blockScreenshots":true}"""))

        assertThat(decoded.extras).isEmpty()
        assertThat(decoded.blockScreenshots).isTrue()
    }

    @Test
    fun `an unknown key survives the write-then-read round trip as it came`() {
        val first = privacyPreferencesFromStorage(
            """{"blockScreenshots":true,"futureFlag":{"nested":[1,2,3]}}""",
        )

        val second = privacyPreferencesFromStorage(first.storageValue)

        assertThat(second).isEqualTo(first)
        assertThat(second.extras["futureFlag"]).isEqualTo(block("""{"nested":[1,2,3]}"""))
    }

    @Test
    fun `the retired calls alias is neither a switch nor kept as an extra`() {
        val decoded = privacyPreferencesFromJson(block("""{"allowCallsFromNonContacts":false}"""))

        assertThat(decoded.acceptCallsFromNonContacts).isTrue()
        assertThat(decoded.extras).isEmpty()
    }

    // ---- notification ----

    @Test
    fun `a notification block with every field off its default round-trips through storage`() {
        val prefs = UserNotificationPreferences(
            pushEnabled = false,
            emailEnabled = false,
            soundEnabled = false,
            vibrationEnabled = false,
            newMessageEnabled = false,
            missedCallEnabled = false,
            callsEnabled = false,
            voicemailEnabled = false,
            systemEnabled = false,
            conversationEnabled = false,
            replyEnabled = false,
            mentionEnabled = false,
            reactionEnabled = false,
            contactRequestEnabled = false,
            groupInviteEnabled = false,
            memberJoinedEnabled = false,
            memberLeftEnabled = true,
            postLikeEnabled = false,
            postCommentEnabled = false,
            postRepostEnabled = false,
            storyReactionEnabled = false,
            commentReplyEnabled = false,
            commentLikeEnabled = true,
            friendContentEnabled = false,
            contactActivityEnabled = false,
            gameEnabled = false,
            dndEnabled = true,
            dndStartTime = "23:30",
            dndEndTime = "07:15",
            dndDays = listOf(DndDay.MON, DndDay.SUN),
            dndUtcOffsetMinutes = -240,
            showPreview = false,
            showSenderName = false,
            groupNotifications = false,
            notificationBadgeEnabled = false,
            extras = mapOf("k" to JsonPrimitive("v")),
        )

        assertThat(notificationPreferencesFromStorage(prefs.storageValue)).isEqualTo(prefs)
    }

    @Test
    fun `a block stored before the three new notification fields reads them at their defaults`() {
        val decoded = notificationPreferencesFromStorage("""{"pushEnabled":false}""")

        assertThat(decoded.pushEnabled).isFalse()
        assertThat(decoded.contactActivityEnabled).isTrue()
        assertThat(decoded.gameEnabled).isTrue()
        assertThat(decoded.dndUtcOffsetMinutes).isEqualTo(0)
    }

    @Test
    fun `the DND days drop the tokens they do not know and keep the others`() {
        val decoded = notificationPreferencesFromJson(
            block("""{"dndDays":["mon","funday","fri",3]}"""),
        )

        assertThat(decoded.dndDays).containsExactly(DndDay.MON, DndDay.FRI).inOrder()
    }

    @Test
    fun `DND days that are not a list fall back to the default`() {
        val decoded = notificationPreferencesFromJson(block("""{"dndDays":"mon","dndEnabled":true}"""))

        assertThat(decoded.dndDays).isEmpty()
        assertThat(decoded.dndEnabled).isTrue()
    }

    @Test
    fun `a time carried as a number falls back to the default`() {
        val decoded = notificationPreferencesFromJson(block("""{"dndStartTime":2200,"dndEndTime":"06:30"}"""))

        assertThat(decoded.dndStartTime).isEqualTo("22:00")
        assertThat(decoded.dndEndTime).isEqualTo("06:30")
    }

    @Test
    fun `the utc offset keeps a valid whole number and drops anything else`() {
        fun offsetOf(raw: String) =
            notificationPreferencesFromJson(block("""{"dndUtcOffsetMinutes":$raw}""")).dndUtcOffsetMinutes

        assertThat(offsetOf("540")).isEqualTo(540)
        assertThat(offsetOf("-720")).isEqualTo(-720)
        assertThat(offsetOf("840")).isEqualTo(840)
        assertThat(offsetOf("\"60\"")).isEqualTo(0)
        assertThat(offsetOf("60.5")).isEqualTo(0)
        assertThat(offsetOf("null")).isEqualTo(0)
        // The gateway refuses the whole category outside UTC-12 h..UTC+14 h: such a value must never be adopted
        // here, or every later notification PATCH would bounce.
        assertThat(offsetOf("841")).isEqualTo(0)
        assertThat(offsetOf("-721")).isEqualTo(0)
    }

    @Test
    fun `the notification storage codec keeps unknown keys in extras`() {
        val decoded = notificationPreferencesFromStorage(
            """{"pushEnabled":false,"gamePhotoEnabled":false}""",
        )

        assertThat(decoded.pushEnabled).isFalse()
        assertThat(decoded.extras["gamePhotoEnabled"]).isEqualTo(JsonPrimitive(false))
    }

    // ---- application (consent stamps, read-only) ----

    @Test
    fun `the five consent stamps are read as strings`() {
        val decoded = applicationPreferencesFromJson(
            block(
                """
                {"theme":"dark",
                 "dataProcessingConsentAt":"2026-09-01T10:00:00.000Z",
                 "voiceDataConsentAt":"2026-09-02T10:00:00.000Z",
                 "voiceProfileConsentAt":"2026-09-03T10:00:00.000Z",
                 "voiceCloningConsentAt":"2026-09-04T10:00:00.000Z",
                 "voiceCloningEnabledAt":"2026-09-05T10:00:00.000Z"}
                """.trimIndent(),
            ),
        )

        assertThat(decoded.theme).isEqualTo(AppThemeMode.DARK)
        assertThat(decoded.dataProcessingConsentAt).isEqualTo("2026-09-01T10:00:00.000Z")
        assertThat(decoded.voiceDataConsentAt).isEqualTo("2026-09-02T10:00:00.000Z")
        assertThat(decoded.voiceProfileConsentAt).isEqualTo("2026-09-03T10:00:00.000Z")
        assertThat(decoded.voiceCloningConsentAt).isEqualTo("2026-09-04T10:00:00.000Z")
        assertThat(decoded.voiceCloningEnabledAt).isEqualTo("2026-09-05T10:00:00.000Z")
    }

    @Test
    fun `a block without consent stamps reads them as absent`() {
        val decoded = applicationPreferencesFromJson(block("""{"theme":"light"}"""))

        assertThat(decoded.dataProcessingConsentAt).isNull()
        assertThat(decoded.voiceCloningEnabledAt).isNull()
    }

    @Test
    fun `a consent stamp that is not a string reads as absent and spares the block`() {
        val decoded = applicationPreferencesFromJson(
            block("""{"voiceDataConsentAt":1700000000,"voiceProfileConsentAt":null,"compactMode":true}"""),
        )

        assertThat(decoded.voiceDataConsentAt).isNull()
        assertThat(decoded.voiceProfileConsentAt).isNull()
        assertThat(decoded.compactMode).isTrue()
    }

    @Test
    fun `application fields fall back one by one`() {
        val decoded = applicationPreferencesFromJson(
            block(
                """{"theme":"sepia","fontSize":"large","tutorialsCompleted":["intro",4,"chat"],"animationsEnabled":"yes"}""",
            ),
        )

        assertThat(decoded.theme).isEqualTo(AppThemeMode.AUTO)
        assertThat(decoded.fontSize).isEqualTo(FontSize.LARGE)
        assertThat(decoded.tutorialsCompleted).containsExactly("intro", "chat").inOrder()
        assertThat(decoded.animationsEnabled).isTrue()
    }

    /**
     * The gateway declares the five stamps `z.never` on the application category since #4180: a
     * single one in a PATCH body refuses the WHOLE category with a 400. The server holds them,
     * `PUT /me/consents/{purpose}` writes them — a preference sync must never carry them.
     */
    @Test
    fun `the application sync body never carries the consent stamps`() {
        val prefs = ApplicationPreferences(
            theme = AppThemeMode.DARK,
            dataProcessingConsentAt = "2026-09-01T10:00:00.000Z",
            voiceDataConsentAt = "2026-09-02T10:00:00.000Z",
            voiceProfileConsentAt = "2026-09-03T10:00:00.000Z",
            voiceCloningConsentAt = "2026-09-04T10:00:00.000Z",
            voiceCloningEnabledAt = "2026-09-05T10:00:00.000Z",
            extras = mapOf("k" to JsonPrimitive("v")),
        )

        val body = prefs.toSyncJson()

        assertThat(body.keys).containsNoneOf(
            "dataProcessingConsentAt",
            "voiceDataConsentAt",
            "voiceProfileConsentAt",
            "voiceCloningConsentAt",
            "voiceCloningEnabledAt",
        )
        assertThat(body["theme"]).isEqualTo(JsonPrimitive("dark"))
        assertThat(body["extras"]).isEqualTo(buildJsonObject { put("k", "v") })
    }

    @Test
    fun `the application sync body keeps every editable field even at its default`() {
        val body = ApplicationPreferences().toSyncJson()

        assertThat(body.keys).containsAtLeast(
            "theme", "accentColor", "interfaceLanguage", "fontSize", "telemetryEnabled", "extras",
        )
        assertThat(body["telemetryEnabled"]).isEqualTo(JsonPrimitive(false))
    }

    @Test
    fun `a stamp read from the server is kept by the local block it lands on`() {
        val local = applicationPreferencesFromJson(
            block("""{"voiceCloningConsentAt":"2026-09-04T10:00:00.000Z"}"""),
        )

        assertThat(local.voiceCloningConsentAt).isEqualTo("2026-09-04T10:00:00.000Z")
        assertThat(local.copy(theme = AppThemeMode.LIGHT).voiceCloningConsentAt)
            .isEqualTo("2026-09-04T10:00:00.000Z")
        assertThat(local.toSyncJson().keys).doesNotContain("voiceCloningConsentAt")
    }
}
