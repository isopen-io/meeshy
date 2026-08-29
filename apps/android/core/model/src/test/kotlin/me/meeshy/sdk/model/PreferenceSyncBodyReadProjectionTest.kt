package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

/**
 * Behavioural spec for the READ half of the two user-level preference wire bodies —
 * what `PreferencesSyncCoordinator` folds onto the device stores when
 * `user:preferences-updated` (category scope) says another device changed a block
 * (issue #4133).
 *
 * The whole risk of a read projection is what it does to the fields the wire body does
 * NOT carry. Both bodies deliberately carry less than the local block, and for reasons
 * that are asymmetric on purpose:
 *
 * - both drop the local-only `extras` map, which must never leak to the backend;
 * - the privacy body additionally drops the four encryption fields, so a device sync
 *   never stamps its defaults over a value set on web or iOS.
 *
 * A projection built from the response alone would inflict exactly that damage in the
 * other direction — resetting on every broadcast what the write side went out of its
 * way not to touch. Every witness below is aimed at that, not at the happy path.
 */
class PreferenceSyncBodyReadProjectionTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    // ---- notification ----

    /** `GET /me/preferences/notification` — the gateway block, every key present. */
    private val notificationResponse = """
        {
          "pushEnabled": false, "emailEnabled": false, "soundEnabled": false,
          "vibrationEnabled": false, "newMessageEnabled": false, "missedCallEnabled": false,
          "voicemailEnabled": false, "systemEnabled": false, "conversationEnabled": false,
          "replyEnabled": false, "mentionEnabled": false, "reactionEnabled": false,
          "contactRequestEnabled": false, "groupInviteEnabled": false,
          "memberJoinedEnabled": false, "memberLeftEnabled": true,
          "postLikeEnabled": false, "postCommentEnabled": false, "postRepostEnabled": false,
          "storyReactionEnabled": false, "commentReplyEnabled": false, "commentLikeEnabled": true,
          "dndEnabled": true, "dndStartTime": "23:30", "dndEndTime": "07:15",
          "dndDays": ["mon", "fri"],
          "showPreview": false, "showSenderName": false, "groupNotifications": false,
          "notificationBadgeEnabled": false
        }
    """.trimIndent()

    @Test
    fun `the notification block decodes key by key and lands on the local block`() {
        val body = json.decodeFromString<NotificationPreferenceSyncBody>(notificationResponse)

        val next = body.toPreferences(UserNotificationPreferences())

        assertThat(next.pushEnabled).isFalse()
        assertThat(next.showPreview).isFalse()
        assertThat(next.dndEnabled).isTrue()
        assertThat(next.dndStartTime).isEqualTo("23:30")
        assertThat(next.dndEndTime).isEqualTo("07:15")
        assertThat(next.dndDays).containsExactly(DndDay.MON, DndDay.FRI).inOrder()
        // The two whose local defaults are false/true respectively — a projection that
        // silently kept defaults instead of reading the wire would pass on all the others.
        assertThat(next.memberLeftEnabled).isTrue()
        assertThat(next.commentLikeEnabled).isTrue()
    }

    /**
     * `extras` is a device-side extension the wire body drops on purpose. Rebuilding the
     * block from the response would erase it on every broadcast.
     */
    @Test
    fun `the notification projection preserves the local-only extras`() {
        val local = UserNotificationPreferences(
            extras = mapOf("androidChannelId" to JsonPrimitive("meeshy_high")),
        )
        val body = json.decodeFromString<NotificationPreferenceSyncBody>(notificationResponse)

        assertThat(body.toPreferences(local).extras)
            .containsExactly("androidChannelId", JsonPrimitive("meeshy_high"))
    }

    /** The round trip is the contract: what this device just PATCHed reads back identical. */
    @Test
    fun `a notification block survives the write-then-read round trip`() {
        val local = UserNotificationPreferences(
            pushEnabled = false,
            dndEnabled = true,
            dndDays = listOf(DndDay.SUN),
            extras = mapOf("k" to JsonPrimitive("v")),
        )

        val roundTripped = NotificationPreferenceSyncBody.from(local).toPreferences(local)

        assertThat(roundTripped).isEqualTo(local)
    }

    // ---- privacy ----

    /**
     * `GET /me/preferences/privacy` — the gateway's whole block, encryption leg included.
     * The lenient decoder drops those four keys, which is the behaviour under test: they
     * are the server's, and Android renders them read-only.
     */
    private val privacyResponse = """
        {
          "showOnlineStatus": false, "showLastSeen": false, "showReadReceipts": false,
          "showTypingIndicator": false, "hideProfileFromSearch": true,
          "allowContactRequests": false, "allowGroupInvites": false,
          "allowCallsFromNonContacts": true, "saveMediaToGallery": true,
          "allowAnalytics": false, "shareUsageData": true, "blockScreenshots": true,
          "encryptionPreference": "always", "autoEncryptNewConversations": true,
          "showEncryptionStatus": false, "warnOnUnencrypted": true
        }
    """.trimIndent()

    @Test
    fun `the privacy block decodes its twelve editable toggles`() {
        val body = json.decodeFromString<PrivacyPreferenceSyncBody>(privacyResponse)

        val next = body.toPreferences(PrivacyPreferences())

        assertThat(next.showOnlineStatus).isFalse()
        assertThat(next.showLastSeen).isFalse()
        assertThat(next.hideProfileFromSearch).isTrue()
        assertThat(next.allowCallsFromNonContacts).isTrue()
        assertThat(next.saveMediaToGallery).isTrue()
        assertThat(next.shareUsageData).isTrue()
        assertThat(next.blockScreenshots).isTrue()
    }

    /**
     * The one that matters. The write side omits the encryption leg so a device sync can
     * never stamp its defaults over a server value; a read that rebuilt the block from the
     * response would undo that guarantee from the other side — and the response DOES carry
     * those keys, so nothing but this projection stands between them and the local block.
     */
    @Test
    fun `the privacy projection leaves the read-only encryption leg untouched`() {
        val local = PrivacyPreferences(
            encryptionPreference = EncryptionPreference.ALWAYS,
            autoEncryptNewConversations = true,
            showEncryptionStatus = false,
            warnOnUnencrypted = true,
        )
        val body = json.decodeFromString<PrivacyPreferenceSyncBody>(privacyResponse)

        val next = body.toPreferences(local)

        assertThat(next.encryptionPreference).isEqualTo(EncryptionPreference.ALWAYS)
        assertThat(next.autoEncryptNewConversations).isTrue()
        assertThat(next.showEncryptionStatus).isFalse()
        assertThat(next.warnOnUnencrypted).isTrue()
    }

    /**
     * And the inverse, so the witness above cannot pass by accident: a local block whose
     * encryption leg is at its DEFAULTS must still come back at those defaults, even though
     * the response asks for something else on all four.
     */
    @Test
    fun `the privacy projection does not adopt the encryption leg the response carries`() {
        val body = json.decodeFromString<PrivacyPreferenceSyncBody>(privacyResponse)

        val next = body.toPreferences(PrivacyPreferences())

        assertThat(next.encryptionPreference).isEqualTo(EncryptionPreference.OPTIONAL)
        assertThat(next.autoEncryptNewConversations).isFalse()
        assertThat(next.showEncryptionStatus).isTrue()
        assertThat(next.warnOnUnencrypted).isFalse()
    }

    @Test
    fun `the privacy projection preserves the local-only extras`() {
        val local = PrivacyPreferences(extras = mapOf("androidScreenshotGuard" to JsonPrimitive(true)))
        val body = json.decodeFromString<PrivacyPreferenceSyncBody>(privacyResponse)

        assertThat(body.toPreferences(local).extras)
            .containsExactly("androidScreenshotGuard", JsonPrimitive(true))
    }

    @Test
    fun `a privacy block survives the write-then-read round trip`() {
        val local = PrivacyPreferences(
            showOnlineStatus = false,
            blockScreenshots = true,
            encryptionPreference = EncryptionPreference.ALWAYS,
            extras = mapOf("k" to JsonPrimitive("v")),
        )

        assertThat(PrivacyPreferenceSyncBody.from(local).toPreferences(local)).isEqualTo(local)
    }
}
