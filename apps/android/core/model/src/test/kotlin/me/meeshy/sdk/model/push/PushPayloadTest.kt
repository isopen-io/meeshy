package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushPayloadTest {

    private fun decode(vararg pairs: Pair<String, String>) = PushPayload.decode(mapOf(*pairs))

    @Test
    fun `chaque cle textuelle du contrat est decodee`() {
        val keys = listOf(
            "notificationId", "type", "conversationId", "messageId", "senderId", "postId",
            "postType", "commentId", "parentCommentId", "callId", "title", "body", "subtitle",
            "notificationLocKey", "firstAttachmentUrl", "thumbnailUrl",
            "replacesNotificationId", "replacesActorSubject", "createdAt",
        )
        val payload = PushPayload.decode(keys.associateWith { "v-$it" })

        assertThat(payload.notificationId).isEqualTo("v-notificationId")
        assertThat(payload.type).isEqualTo("v-type")
        assertThat(payload.conversationId).isEqualTo("v-conversationId")
        assertThat(payload.messageId).isEqualTo("v-messageId")
        assertThat(payload.senderId).isEqualTo("v-senderId")
        assertThat(payload.postId).isEqualTo("v-postId")
        assertThat(payload.postType).isEqualTo("v-postType")
        assertThat(payload.commentId).isEqualTo("v-commentId")
        assertThat(payload.parentCommentId).isEqualTo("v-parentCommentId")
        assertThat(payload.callId).isEqualTo("v-callId")
        assertThat(payload.title).isEqualTo("v-title")
        assertThat(payload.body).isEqualTo("v-body")
        assertThat(payload.subtitle).isEqualTo("v-subtitle")
        assertThat(payload.notificationLocKey).isEqualTo("v-notificationLocKey")
        assertThat(payload.firstAttachmentUrl).isEqualTo("v-firstAttachmentUrl")
        assertThat(payload.thumbnailUrl).isEqualTo("v-thumbnailUrl")
        assertThat(payload.replacesNotificationId).isEqualTo("v-replacesNotificationId")
        assertThat(payload.replacesActorSubject).isEqualTo("v-replacesActorSubject")
        assertThat(payload.createdAt).isEqualTo("v-createdAt")
    }

    @Test
    fun `les nombres recus en chaines sont decodes`() {
        val payload = decode(
            "ephemeralDuration" to "3600",
            "effectFlags" to "5",
            "unreadCount" to "12",
            "conversationUnread" to "3",
        )

        assertThat(payload.ephemeralDuration).isEqualTo(3600)
        assertThat(payload.effectFlags).isEqualTo(5)
        assertThat(payload.unreadCount).isEqualTo(12)
        assertThat(payload.conversationUnread).isEqualTo(3)
    }

    @Test
    fun `les booleens recus en chaines sont decodes`() {
        assertThat(decode("isVideo" to "true").isVideo).isTrue()
        assertThat(decode("isVideo" to "TRUE").isVideo).isTrue()
        assertThat(decode("isVideo" to "false").isVideo).isFalse()
        assertThat(decode("isVideo" to "1").isVideo).isTrue()
        assertThat(decode("isVideo" to "0").isVideo).isFalse()
    }

    @Test
    fun `une cle absente donne null`() {
        val payload = decode()

        assertThat(payload.type).isNull()
        assertThat(payload.ephemeralDuration).isNull()
        assertThat(payload.unreadCount).isNull()
        assertThat(payload.isVideo).isNull()
    }

    @Test
    fun `une valeur vide ou blanche donne null`() {
        val payload = decode("type" to "", "body" to "   ", "unreadCount" to "", "isVideo" to " ")

        assertThat(payload.type).isNull()
        assertThat(payload.body).isNull()
        assertThat(payload.unreadCount).isNull()
        assertThat(payload.isVideo).isNull()
    }

    @Test
    fun `une duree ephemere non numerique donne null sans exception`() {
        assertThat(decode("ephemeralDuration" to "abc").ephemeralDuration).isNull()
        assertThat(decode("ephemeralDuration" to "12.5").ephemeralDuration).isNull()
        assertThat(decode("unreadCount" to "99999999999999").unreadCount).isNull()
        assertThat(decode("isVideo" to "peut-etre").isVideo).isNull()
    }

    @Test
    fun `les cles inconnues sont ignorees`() {
        val payload = decode("type" to "new_message", "futureKey" to "x")

        assertThat(payload.type).isEqualTo("new_message")
    }

    @Test
    fun `un nombre avec espaces est tolere`() {
        assertThat(decode("unreadCount" to " 7 ").unreadCount).isEqualTo(7)
    }
}
