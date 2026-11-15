package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationChannelImportance
import me.meeshy.sdk.model.NotificationChannelPlan
import org.junit.Test

class PushChannelPlanTest {
    @Test
    fun `un message est HIGH sur le canal des messages`() {
        val a = PushChannelPlan.assign("new_message")
        assertThat(a.channelId).isEqualTo(NotificationChannelPlan.MESSAGES)
        assertThat(a.importance).isEqualTo(NotificationChannelImportance.HIGH)
    }

    @Test
    fun `une mention est HIGH`() {
        assertThat(PushChannelPlan.assign("user_mentioned").importance).isEqualTo(NotificationChannelImportance.HIGH)
    }

    @Test
    fun `le social est DEFAULT`() {
        assertThat(PushChannelPlan.assign("post_like").importance).isEqualTo(NotificationChannelImportance.DEFAULT)
    }

    @Test
    fun `un message ephemere va sur le canal discret`() {
        val a = PushChannelPlan.assign("new_message", ephemeral = true)
        assertThat(a.channelId).isEqualTo(NotificationChannelPlan.EPHEMERAL)
        assertThat(a.importance).isEqualTo(NotificationChannelImportance.LOW)
    }

    @Test
    fun `un type inconnu ou absent retombe sur les messages`() {
        assertThat(PushChannelPlan.assign("future_type").channelId).isEqualTo(NotificationChannelPlan.MESSAGES)
        assertThat(PushChannelPlan.assign(null).channelId).isEqualTo(NotificationChannelPlan.MESSAGES)
    }
}
