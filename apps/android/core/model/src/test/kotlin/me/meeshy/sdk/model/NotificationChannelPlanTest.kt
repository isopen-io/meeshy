package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationChannelPlanTest {

    @Test
    fun `every category lands on a channel of the plan`() {
        MeeshyNotificationCategory.entries.forEach { category ->
            val spec = NotificationChannelPlan.channelFor(category)
            assertThat(NotificationChannelPlan.channels).contains(spec)
        }
    }

    @Test
    fun `an unknown category or type falls on the generic messages channel`() {
        assertThat(MeeshyNotificationCategory.of(rawCategory = "MEESHY_FUTURE", type = "brand_new_type")).isEqualTo(MeeshyNotificationCategory.GENERIC)
        assertThat(NotificationChannelPlan.channelIdFor(MeeshyNotificationCategory.GENERIC)).isEqualTo("meeshy_messages_v2")
        assertThat(MeeshyNotificationCategory.of()).isEqualTo(MeeshyNotificationCategory.GENERIC)
    }

    @Test
    fun `the MEESHY wire identifiers map to their category`() {
        assertThat(MeeshyNotificationCategory.fromWire("MEESHY_MENTION")).isEqualTo(MeeshyNotificationCategory.MENTION)
        assertThat(MeeshyNotificationCategory.fromWire("MEESHY_SOCIAL_COMMENTABLE")).isEqualTo(MeeshyNotificationCategory.SOCIAL_COMMENTABLE)
        assertThat(MeeshyNotificationCategory.fromWire("MEESHY_INVITE")).isEqualTo(MeeshyNotificationCategory.INVITATION)
        assertThat(MeeshyNotificationCategory.fromWire("MEESHY_CALL")).isEqualTo(MeeshyNotificationCategory.CALL_INCOMING)
        assertThat(MeeshyNotificationCategory.fromWire("nope")).isNull()
        assertThat(MeeshyNotificationCategory.of(rawCategory = "MEESHY_AUDIO", type = "new_message")).isEqualTo(MeeshyNotificationCategory.AUDIO)
    }

    @Test
    fun `gateway types derive the same category as the gateway header`() {
        val expected = mapOf(
            "new_message" to MeeshyNotificationCategory.MESSAGE,
            "user_mentioned" to MeeshyNotificationCategory.MENTION,
            "friend_request" to MeeshyNotificationCategory.FRIEND_REQUEST,
            "post_like" to MeeshyNotificationCategory.SOCIAL,
            "post_comment" to MeeshyNotificationCategory.SOCIAL_COMMENTABLE,
            "incoming_call" to MeeshyNotificationCategory.CALL_INCOMING,
            "missed_call" to MeeshyNotificationCategory.CALL_MISSED,
            "contact_joined" to MeeshyNotificationCategory.CONTACT,
            "community_invite" to MeeshyNotificationCategory.INVITATION,
            "security_alert" to MeeshyNotificationCategory.SYSTEM,
        )
        expected.forEach { (type, category) -> assertThat(MeeshyNotificationCategory.of(type = type)).isEqualTo(category) }
    }

    @Test
    fun `an ephemeral or voice message takes its content category`() {
        assertThat(MeeshyNotificationCategory.of(type = "new_message", ephemeral = true)).isEqualTo(MeeshyNotificationCategory.EPHEMERAL)
        assertThat(MeeshyNotificationCategory.of(type = "new_message", audio = true)).isEqualTo(MeeshyNotificationCategory.AUDIO)
        assertThat(MeeshyNotificationCategory.of(type = "post_like", ephemeral = true)).isEqualTo(MeeshyNotificationCategory.SOCIAL)
    }

    @Test
    fun `the table maps categories to channel, group, importance and sound`() {
        fun spec(category: MeeshyNotificationCategory) = NotificationChannelPlan.channelFor(category)

        assertThat(spec(MeeshyNotificationCategory.CALL_INCOMING).sound).isEqualTo(NotificationChannelSound.RINGTONE)
        assertThat(spec(MeeshyNotificationCategory.CALL_INCOMING).importance).isEqualTo(NotificationChannelImportance.HIGH)
        assertThat(spec(MeeshyNotificationCategory.CALL_INCOMING).group).isEqualTo(NotificationChannelGroup.CALLS)
        assertThat(spec(MeeshyNotificationCategory.CALL_MISSED).id).isNotEqualTo(spec(MeeshyNotificationCategory.CALL_INCOMING).id)
        assertThat(spec(MeeshyNotificationCategory.CALL_MISSED).sound).isNotEqualTo(NotificationChannelSound.RINGTONE)
        assertThat(spec(MeeshyNotificationCategory.EPHEMERAL).importance).isEqualTo(NotificationChannelImportance.LOW)
        assertThat(spec(MeeshyNotificationCategory.EPHEMERAL).vibrate).isFalse()
        assertThat(spec(MeeshyNotificationCategory.MENTION).group).isEqualTo(NotificationChannelGroup.MESSAGES)
        assertThat(spec(MeeshyNotificationCategory.FRIEND_REQUEST).group).isEqualTo(NotificationChannelGroup.FRIENDS)
        assertThat(spec(MeeshyNotificationCategory.SOCIAL_COMMENTABLE).group).isEqualTo(NotificationChannelGroup.SOCIAL)
        assertThat(spec(MeeshyNotificationCategory.INVITATION).group).isEqualTo(NotificationChannelGroup.OTHERS)
        assertThat(spec(MeeshyNotificationCategory.SYSTEM).group).isEqualTo(NotificationChannelGroup.OTHERS)
    }

    @Test
    fun `channel ids are unique and the five groups are all used`() {
        assertThat(NotificationChannelPlan.channels.map { it.id }.toSet()).hasSize(NotificationChannelPlan.channels.size)
        assertThat(NotificationChannelPlan.channels.map { it.group }.toSet()).containsExactlyElementsIn(NotificationChannelGroup.entries)
    }

    @Test
    fun `the v1 channel the gateway names is not a plan channel`() {
        assertThat(NotificationChannelPlan.channels.map { it.id }).doesNotContain("meeshy_notifications")
    }
}
