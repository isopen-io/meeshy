package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `NSEAttachmentPolicy.sealingLockedConversation` : la charge scellée ne garde QUE ce qui route et nomme. */
class PushConversationLockSealTest {

    private val rich = mapOf(
        "type" to "new_message",
        "notificationId" to "n1",
        "conversationId" to "c1",
        "messageId" to "m1",
        "senderId" to "u1",
        "senderDisplayName" to "Bob",
        "title" to "Bob",
        "createdAt" to "2026-11-17T10:00:00Z",
        "unreadCount" to "3",
        "replacesNotificationId" to "n0",
        "recipientUserId" to "me",
        "body" to "mon code de porte est 4471",
        "subtitle" to "4471",
        "senderAvatar" to "https://gate.meeshy.me/u/bob.jpg",
        "imageURL" to "https://gate.meeshy.me/u/bob.jpg",
        "attachmentUrl" to "https://gate.meeshy.me/a/photo.jpg",
        "firstAttachmentUrl" to "https://gate.meeshy.me/a/photo.jpg",
        "thumbnailUrl" to "https://gate.meeshy.me/a/thumb.jpg",
        "attachmentMimeType" to "image/jpeg",
        "attachmentFileSize" to "1024",
        "futureContentKey" to "texte d une cle que la passerelle ajoutera demain",
    )

    @Test
    fun `la charge scellee ne garde aucun contenu`() {
        val sealed = PushConversationLockSeal.seal(rich)

        val leaks = sealed.filterValues { "4471" in it || "photo" in it || "thumb" in it || "bob.jpg" in it || "demain" in it }
        assertThat(leaks).isEmpty()
        assertThat(sealed.keys).containsNoneOf("body", "subtitle", "senderAvatar", "imageURL", "attachmentUrl", "firstAttachmentUrl", "thumbnailUrl", "futureContentKey")
    }

    @Test
    fun `la charge scellee garde ce qui route et qui date`() {
        val payload = PushPayload.decode(PushConversationLockSeal.seal(rich))

        assertThat(payload.type).isEqualTo("new_message")
        assertThat(payload.notificationId).isEqualTo("n1")
        assertThat(payload.conversationId).isEqualTo("c1")
        assertThat(payload.messageId).isEqualTo("m1")
        assertThat(payload.senderId).isEqualTo("u1")
        assertThat(payload.senderDisplayName).isEqualTo("Bob")
        assertThat(payload.createdAt).isEqualTo("2026-11-17T10:00:00Z")
        assertThat(payload.unreadCount).isEqualTo(3)
        assertThat(payload.replacesNotificationId).isEqualTo("n0")
        assertThat(payload.recipientUserId).isEqualTo("me")
    }

    @Test
    fun `la charge scellee declare sa protection`() {
        val payload = PushPayload.decode(PushConversationLockSeal.seal(rich))

        assertThat(payload.notificationLocKey).isEqualTo("notification.locked_conversation")
        assertThat(payload.mediaMayTravel).isFalse()
        assertThat(PushConversationLockSeal.isSealed(payload)).isTrue()
    }

    @Test
    fun `une cle de protection servie par la passerelle cede au scelle`() {
        val payload = PushPayload.decode(PushConversationLockSeal.seal(rich + ("notificationLocKey" to "notification.view_once_message")))

        assertThat(payload.notificationLocKey).isEqualTo("notification.locked_conversation")
    }

    @Test
    fun `une charge non scellee n est pas reconnue comme scellee`() {
        assertThat(PushConversationLockSeal.isSealed(PushPayload.decode(rich))).isFalse()
        assertThat(PushConversationLockSeal.isSealed(PushPayload.decode(rich + ("notificationLocKey" to "notification.view_once_message")))).isFalse()
    }
}
