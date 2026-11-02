package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationChannelPlanTest {

    @Test
    fun `every category lands on a channel of the plan`() {
        NotificationCategory.entries.forEach { category ->
            val spec = NotificationChannelPlan.channelFor(category)
            assertThat(NotificationChannelPlan.channels).contains(spec)
        }
    }

    @Test
    fun `an unknown category or type falls on the generic messages channel`() {
        assertThat(NotificationCategory.of(rawCategory = "MEESHY_FUTURE", type = "brand_new_type")).isEqualTo(NotificationCategory.GENERIC)
        assertThat(NotificationChannelPlan.channelIdFor(NotificationCategory.GENERIC)).isEqualTo("meeshy_messages_v2")
        assertThat(NotificationCategory.of()).isEqualTo(NotificationCategory.GENERIC)
    }

    @Test
    fun `the MEESHY wire identifiers map to their category`() {
        assertThat(NotificationCategory.fromWire("MEESHY_MENTION")).isEqualTo(NotificationCategory.MENTION)
        assertThat(NotificationCategory.fromWire("MEESHY_SOCIAL_COMMENTABLE")).isEqualTo(NotificationCategory.SOCIAL_COMMENTABLE)
        assertThat(NotificationCategory.fromWire("MEESHY_INVITE")).isEqualTo(NotificationCategory.INVITATION)
        assertThat(NotificationCategory.fromWire("MEESHY_CALL")).isEqualTo(NotificationCategory.CALL_INCOMING)
        assertThat(NotificationCategory.fromWire("nope")).isNull()
        assertThat(NotificationCategory.of(rawCategory = "MEESHY_AUDIO", type = "new_message")).isEqualTo(NotificationCategory.AUDIO)
    }

    @Test
    fun `gateway types derive the same category as the gateway header`() {
        val expected = mapOf(
            "new_message" to NotificationCategory.MESSAGE,
            "user_mentioned" to NotificationCategory.MENTION,
            "friend_request" to NotificationCategory.FRIEND_REQUEST,
            "post_like" to NotificationCategory.SOCIAL,
            "post_comment" to NotificationCategory.SOCIAL_COMMENTABLE,
            "incoming_call" to NotificationCategory.CALL_INCOMING,
            "missed_call" to NotificationCategory.CALL_MISSED,
            "contact_joined" to NotificationCategory.CONTACT,
            "community_invite" to NotificationCategory.INVITATION,
            "security_alert" to NotificationCategory.SYSTEM,
        )
        expected.forEach { (type, category) -> assertThat(NotificationCategory.of(type = type)).isEqualTo(category) }
    }

    @Test
    fun `an ephemeral or voice message takes its content category`() {
        assertThat(NotificationCategory.of(type = "new_message", ephemeral = true)).isEqualTo(NotificationCategory.EPHEMERAL)
        assertThat(NotificationCategory.of(type = "new_message", audio = true)).isEqualTo(NotificationCategory.AUDIO)
        assertThat(NotificationCategory.of(type = "post_like", ephemeral = true)).isEqualTo(NotificationCategory.SOCIAL)
    }

    @Test
    fun `the table maps categories to channel, group, importance and sound`() {
        fun spec(category: NotificationCategory) = NotificationChannelPlan.channelFor(category)

        assertThat(spec(NotificationCategory.CALL_INCOMING).sound).isEqualTo(NotificationChannelSound.RINGTONE)
        assertThat(spec(NotificationCategory.CALL_INCOMING).importance).isEqualTo(NotificationChannelImportance.HIGH)
        assertThat(spec(NotificationCategory.CALL_INCOMING).group).isEqualTo(NotificationChannelGroup.CALLS)
        assertThat(spec(NotificationCategory.CALL_MISSED).id).isNotEqualTo(spec(NotificationCategory.CALL_INCOMING).id)
        assertThat(spec(NotificationCategory.CALL_MISSED).sound).isNotEqualTo(NotificationChannelSound.RINGTONE)
        assertThat(spec(NotificationCategory.EPHEMERAL).importance).isEqualTo(NotificationChannelImportance.LOW)
        assertThat(spec(NotificationCategory.EPHEMERAL).vibrate).isFalse()
        assertThat(spec(NotificationCategory.MENTION).group).isEqualTo(NotificationChannelGroup.MESSAGES)
        assertThat(spec(NotificationCategory.FRIEND_REQUEST).group).isEqualTo(NotificationChannelGroup.FRIENDS)
        assertThat(spec(NotificationCategory.SOCIAL_COMMENTABLE).group).isEqualTo(NotificationChannelGroup.SOCIAL)
        assertThat(spec(NotificationCategory.INVITATION).group).isEqualTo(NotificationChannelGroup.OTHERS)
        assertThat(spec(NotificationCategory.SYSTEM).group).isEqualTo(NotificationChannelGroup.OTHERS)
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
