package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushNotificationActionsTest {

    private fun message(
        type: String = "new_message",
        conversationId: String? = "6501a1b2c3d4e5f607182930",
        notificationLocKey: String? = null,
        effectFlags: Int? = null,
        ephemeralDuration: Int? = null,
    ) = PushPayload(
        type = type,
        conversationId = conversationId,
        notificationLocKey = notificationLocKey,
        effectFlags = effectFlags,
        ephemeralDuration = ephemeralDuration,
    )

    @Test
    fun `un message de conversation offre repondre et marquer comme lu`() {
        listOf("new_message", "message_reply", "reply", "user_mentioned", "mention", "message_forwarded").forEach { type ->
            assertThat(PushNotificationActions.offer(message(type = type)))
                .isEqualTo(PushActionOffer(reply = true, markRead = true))
        }
    }

    @Test
    fun `un message protege n offre aucune action`() {
        assertThat(PushNotificationActions.offer(message(notificationLocKey = "encrypted"))).isEqualTo(PushActionOffer.NONE)
        assertThat(PushNotificationActions.offer(message(effectFlags = 0b001))).isEqualTo(PushActionOffer.NONE)
        assertThat(PushNotificationActions.offer(message(ephemeralDuration = 30))).isEqualTo(PushActionOffer.NONE)
    }

    @Test
    fun `sans conversation lisible aucune action`() {
        assertThat(PushNotificationActions.offer(message(conversationId = null))).isEqualTo(PushActionOffer.NONE)
        assertThat(PushNotificationActions.offer(message(conversationId = "../etc"))).isEqualTo(PushActionOffer.NONE)
    }

    @Test
    fun `un type social ou de compte n offre pas de reponse`() {
        assertThat(PushNotificationActions.offer(message(type = "post_comment"))).isEqualTo(PushActionOffer.NONE)
        assertThat(PushNotificationActions.offer(message(type = "login_new_device"))).isEqualTo(PushActionOffer.NONE)
    }

    @Test
    fun `l expediteur prend le nom d affichage puis le pseudo puis le titre`() {
        assertThat(PushNotificationActions.senderName(PushPayload(senderDisplayName = "Ana", senderUsername = "ana_b", title = "T"))).isEqualTo("Ana")
        assertThat(PushNotificationActions.senderName(PushPayload(senderUsername = "ana_b", title = "T"))).isEqualTo("ana_b")
        assertThat(PushNotificationActions.senderName(PushPayload(title = "T"))).isEqualTo("T")
        assertThat(PushNotificationActions.senderName(PushPayload())).isNull()
    }

    @Test
    fun `la date du message est celle du serveur sinon l instant de reception`() {
        assertThat(PushNotificationActions.timestampMillis(PushPayload(createdAt = "2026-10-27T10:00:00.000Z"), nowMillis = 5L))
            .isEqualTo(1_793_095_200_000L)
        assertThat(PushNotificationActions.timestampMillis(PushPayload(createdAt = "pas une date"), nowMillis = 5L)).isEqualTo(5L)
        assertThat(PushNotificationActions.timestampMillis(PushPayload(), nowMillis = 7L)).isEqualTo(7L)
    }
}
