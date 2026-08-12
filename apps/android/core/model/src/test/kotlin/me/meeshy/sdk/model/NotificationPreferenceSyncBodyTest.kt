package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * The wire body sent to `PATCH /me/preferences/notification` is projected from the
 * device-local [UserNotificationPreferences] block by [NotificationPreferenceSyncBody.from].
 * It is the single source of truth for the gateway contract: it must carry every one of the
 * gateway `NotificationPreferenceSchema` fields (and only those — the local-only `extras`
 * map is never sent), with the DND days encoded as the lowercase enum tokens the gateway
 * validates.
 */
class NotificationPreferenceSyncBodyTest {

    private val json = Json { encodeDefaults = true }

    /** The exact field set the gateway `NotificationPreferenceSchema` accepts (30 fields). */
    private val gatewayFields = setOf(
        "pushEnabled", "emailEnabled", "soundEnabled", "vibrationEnabled",
        "newMessageEnabled", "missedCallEnabled", "voicemailEnabled", "systemEnabled",
        "conversationEnabled", "replyEnabled", "mentionEnabled", "reactionEnabled",
        "contactRequestEnabled", "groupInviteEnabled", "memberJoinedEnabled", "memberLeftEnabled",
        "postLikeEnabled", "postCommentEnabled", "postRepostEnabled", "storyReactionEnabled",
        "commentReplyEnabled", "commentLikeEnabled",
        "dndEnabled", "dndStartTime", "dndEndTime", "dndDays",
        "showPreview", "showSenderName", "groupNotifications", "notificationBadgeEnabled",
    )

    @Test
    fun `from projects the notification block field-for-field`() {
        val prefs = UserNotificationPreferences(
            pushEnabled = false,
            emailEnabled = false,
            soundEnabled = false,
            newMessageEnabled = false,
            missedCallEnabled = false,
            postLikeEnabled = false,
            dndEnabled = true,
            dndStartTime = "23:15",
            dndEndTime = "06:45",
            dndDays = listOf(DndDay.MON, DndDay.WED, DndDay.FRI),
            showPreview = false,
            notificationBadgeEnabled = false,
        )

        val body = NotificationPreferenceSyncBody.from(prefs)

        assertThat(body.pushEnabled).isFalse()
        assertThat(body.emailEnabled).isFalse()
        assertThat(body.soundEnabled).isFalse()
        assertThat(body.newMessageEnabled).isFalse()
        assertThat(body.missedCallEnabled).isFalse()
        assertThat(body.postLikeEnabled).isFalse()
        assertThat(body.dndEnabled).isTrue()
        assertThat(body.dndStartTime).isEqualTo("23:15")
        assertThat(body.dndEndTime).isEqualTo("06:45")
        assertThat(body.dndDays).containsExactly(DndDay.MON, DndDay.WED, DndDay.FRI).inOrder()
        assertThat(body.showPreview).isFalse()
        assertThat(body.notificationBadgeEnabled).isFalse()
        // A field left at its default is still carried (parity — never a partial-omit surprise).
        assertThat(body.vibrationEnabled).isTrue()
        assertThat(body.reactionEnabled).isTrue()
    }

    @Test
    fun `the serialized body carries exactly the gateway fields and never the local extras`() {
        val prefs = UserNotificationPreferences()

        val obj = json.encodeToString(NotificationPreferenceSyncBody.from(prefs)).let {
            Json.parseToJsonElement(it).jsonObject
        }

        assertThat(obj.keys).isEqualTo(gatewayFields)
        assertThat(obj.keys).doesNotContain("extras")
    }

    @Test
    fun `dnd days serialize as the lowercase tokens the gateway validates`() {
        val prefs = UserNotificationPreferences(dndDays = listOf(DndDay.SUN, DndDay.SAT))

        val obj = json.encodeToString(NotificationPreferenceSyncBody.from(prefs)).let {
            Json.parseToJsonElement(it).jsonObject
        }
        val days = obj["dndDays"]!!.jsonArray.map { it.jsonPrimitive.content }

        assertThat(days).containsExactly("sun", "sat").inOrder()
    }

    @Test
    fun `an all-default block projects the default values`() {
        val body = NotificationPreferenceSyncBody.from(UserNotificationPreferences())

        assertThat(body.pushEnabled).isTrue()
        assertThat(body.emailEnabled).isTrue()
        assertThat(body.dndEnabled).isFalse()
        assertThat(body.dndStartTime).isEqualTo("22:00")
        assertThat(body.dndEndTime).isEqualTo("08:00")
        assertThat(body.dndDays).isEmpty()
        // the model default that intentionally diverges from the others survives the projection
        assertThat(body.memberLeftEnabled).isFalse()
        assertThat(body.commentLikeEnabled).isFalse()
    }
}
