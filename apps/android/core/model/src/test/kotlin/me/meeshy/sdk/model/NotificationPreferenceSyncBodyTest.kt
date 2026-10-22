package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
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

    /** The wire config of `MeeshyApi.json` (outbox payload and PATCH body): defaults NOT encoded. */
    private val wire = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /**
     * The field set the gateway `NotificationPreferenceSchema` accepts and this body carries.
     * `callsEnabled` and `friendContentEnabled` are the two per-type toggles that gate
     * incoming-call and friend-content notifications (iOS `isTypeEnabled` parity);
     * `contactActivityEnabled` (#8285) and `gameEnabled` (#9490) gate `contact_recently_active`
     * and the `game_*` family; `dndUtcOffsetMinutes` (GW7) is the offset the gateway evaluates
     * the DND window with.
     */
    private val gatewayFields = setOf(
        "pushEnabled", "emailEnabled", "soundEnabled", "vibrationEnabled",
        "newMessageEnabled", "missedCallEnabled", "callsEnabled", "voicemailEnabled", "systemEnabled",
        "conversationEnabled", "replyEnabled", "mentionEnabled", "reactionEnabled",
        "contactRequestEnabled", "groupInviteEnabled", "memberJoinedEnabled", "memberLeftEnabled",
        "postLikeEnabled", "postCommentEnabled", "postRepostEnabled", "storyReactionEnabled",
        "commentReplyEnabled", "commentLikeEnabled", "friendContentEnabled",
        "contactActivityEnabled", "gameEnabled",
        "dndEnabled", "dndStartTime", "dndEndTime", "dndDays", "dndUtcOffsetMinutes",
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
        // the two per-type toggles default on (iOS + gateway schema parity)
        assertThat(body.callsEnabled).isTrue()
        assertThat(body.friendContentEnabled).isTrue()
    }

    @Test
    fun `the calls and friend-content toggles survive the round trip both ways`() {
        val prefs = UserNotificationPreferences(callsEnabled = false, friendContentEnabled = false)

        val body = NotificationPreferenceSyncBody.from(prefs)
        assertThat(body.callsEnabled).isFalse()
        assertThat(body.friendContentEnabled).isFalse()

        // toPreferences carries the gateway's values back onto the local block.
        val roundTripped = body.toPreferences(UserNotificationPreferences())
        assertThat(roundTripped.callsEnabled).isFalse()
        assertThat(roundTripped.friendContentEnabled).isFalse()
    }

    @Test
    fun `the contact-activity, game and utc-offset fields project and survive the round trip`() {
        val prefs = UserNotificationPreferences(
            contactActivityEnabled = false,
            gameEnabled = false,
            dndUtcOffsetMinutes = 540,
        )

        val body = NotificationPreferenceSyncBody.from(prefs)

        assertThat(body.contactActivityEnabled).isFalse()
        assertThat(body.gameEnabled).isFalse()
        assertThat(body.dndUtcOffsetMinutes).isEqualTo(540)
        assertThat(body.toPreferences(UserNotificationPreferences())).isEqualTo(prefs)
    }

    @Test
    fun `the three new fields ride the wire whatever their value when defaults are not encoded`() {
        val obj = wire.encodeToString(NotificationPreferenceSyncBody.from(UserNotificationPreferences())).let {
            Json.parseToJsonElement(it).jsonObject
        }

        assertThat(obj.keys).isEqualTo(gatewayFields)
        assertThat(obj["contactActivityEnabled"]!!.jsonPrimitive.content).isEqualTo("true")
        assertThat(obj["gameEnabled"]!!.jsonPrimitive.content).isEqualTo("true")
        assertThat(obj["dndUtcOffsetMinutes"]!!.jsonPrimitive.content).isEqualTo("0")
    }

    /**
     * A row queued before these fields existed does not carry them. Replaying it must not stamp
     * `true / true / 0` over what another device wrote — `0` above all, which would put an iOS
     * user's DND window back on UTC.
     */
    @Test
    fun `a row queued before the new fields replays without inventing them`() {
        val legacy = wire.encodeToString(NotificationPreferenceSyncBody.from(UserNotificationPreferences()))
            .let { Json.parseToJsonElement(it).jsonObject }
            .filterKeys { it !in setOf("contactActivityEnabled", "gameEnabled", "dndUtcOffsetMinutes") }
            .let { JsonObject(it).toString() }

        val replayed = wire.decodeFromString<NotificationPreferenceSyncBody>(legacy)
        val obj = wire.encodeToString(replayed).let { Json.parseToJsonElement(it).jsonObject }

        assertThat(obj.keys).doesNotContain("contactActivityEnabled")
        assertThat(obj.keys).doesNotContain("gameEnabled")
        assertThat(obj.keys).doesNotContain("dndUtcOffsetMinutes")
        val local = UserNotificationPreferences(contactActivityEnabled = false, dndUtcOffsetMinutes = 60)
        assertThat(replayed.toPreferences(local).contactActivityEnabled).isFalse()
        assertThat(replayed.toPreferences(local).dndUtcOffsetMinutes).isEqualTo(60)
    }
}
