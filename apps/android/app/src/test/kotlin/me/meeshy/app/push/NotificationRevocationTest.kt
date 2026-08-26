package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the `notification_revoked` control push — the pure
 * parsing of the FCM `data` map and the `NotificationManager` ids the service
 * must cancel. Mirrors the gateway contract
 * (`services/notifications/notificationRevocationPush.ts`) shared with iOS
 * and the web: ids joined by comma, conversations aligned, empty when absent,
 * and the notification TYPES aligned too — the key that says which banner was
 * posted under its CONVERSATION and which under its own notification.
 */
class NotificationRevocationTest {

    private val n1 = "64d000000000000000000001"
    private val n2 = "64d000000000000000000002"
    private val convA = "507f1f77bcf86cd799439021"

    @Test
    fun `parses the comma-joined ids of a revocation push`() {
        val revocation = NotificationRevocationParser.parse(
            mapOf("type" to "notification_revoked", "notificationIds" to "$n1,$n2"),
        )

        assertThat(revocation).isEqualTo(
            NotificationRevocation(
                notificationIds = listOf(n1, n2),
                conversationIds = emptyList(),
                types = emptyList(),
            ),
        )
    }

    @Test
    fun `keeps conversationIds aligned on notificationIds, blanks included`() {
        val revocation = NotificationRevocationParser.parse(
            mapOf(
                "type" to "notification_revoked",
                "notificationIds" to "$n1,$n2",
                "conversationIds" to ",$convA",
            ),
        )

        assertThat(revocation?.conversationIds).containsExactly("", convA).inOrder()
    }

    @Test
    fun `any other push, or a revocation without ids, is not a revocation`() {
        assertThat(NotificationRevocationParser.parse(mapOf("type" to "new_message", "notificationId" to n1))).isNull()
        assertThat(NotificationRevocationParser.parse(mapOf("type" to "notification_revoked", "notificationIds" to ""))).isNull()
        assertThat(NotificationRevocationParser.parse(emptyMap())).isNull()
    }

    @Test
    fun `cancels the id of every notification and of every conversation that INDEXES one`() {
        val revocation = NotificationRevocation(
            notificationIds = listOf(n1, n2),
            conversationIds = listOf("", convA),
            types = listOf("post_comment", "new_message"),
        )

        assertThat(revocation.notificationManagerIds())
            .containsExactly(n1.hashCode(), n2.hashCode(), convA.hashCode())
    }

    @Test
    fun `the cancelled ids are the very ones showNotification posts under`() {
        val revocation = NotificationRevocation(
            notificationIds = listOf(n1),
            conversationIds = listOf(convA),
            types = listOf("new_message"),
        )

        assertThat(revocation.notificationManagerIds()).containsExactly(
            MessageNotificationId.of(type = "post_comment", conversationId = null, notificationId = n1),
            MessageNotificationId.of(type = "new_message", conversationId = convA, notificationId = n1),
        )
    }

    @Test
    fun `a message arrival is indexed by its conversation, everything else by its notification`() {
        assertThat(MessageNotificationId.of(type = "new_message", conversationId = convA, notificationId = n1))
            .isEqualTo(convA.hashCode())
        assertThat(MessageNotificationId.of(type = "new_message", conversationId = "", notificationId = n1))
            .isEqualTo(n1.hashCode())
        assertThat(MessageNotificationId.of(type = "new_message", conversationId = null, notificationId = n1))
            .isEqualTo(n1.hashCode())
    }

    @Test
    fun `two social notifications never collide on the same index`() {
        val first = MessageNotificationId.of(type = "post_comment", conversationId = "", notificationId = n1)
        val second = MessageNotificationId.of(type = "post_comment", conversationId = "", notificationId = n2)

        assertThat(first).isNotEqualTo(second)
        assertThat(first).isNotEqualTo(0)
    }

    // ------------------------------------------------------------------
    // Le type DÉCIDE de l'index — sans lui, la bannière d'une réaction
    // partageait celle du dernier message de la conversation, et la révoquer
    // annulait une bannière VALIDE sans rapport.
    // ------------------------------------------------------------------

    @Test
    fun `only a real message arrival replaces the banner of its conversation`() {
        assertThat(MessageNotificationId.of(type = "new_message", conversationId = convA, notificationId = n1))
            .isEqualTo(convA.hashCode())
        assertThat(MessageNotificationId.of(type = "message_reply", conversationId = convA, notificationId = n1))
            .isEqualTo(convA.hashCode())

        listOf("message_reaction", "user_mentioned", "mention", "post_comment", "comment_reply", "friend_request")
            .forEach { type ->
                assertThat(MessageNotificationId.of(type = type, conversationId = convA, notificationId = n1))
                    .isEqualTo(n1.hashCode())
            }
    }

    /**
     * Le défaut que ce lot corrige : une réaction retirée dans une conversation
     * ACTIVE annulait la bannière du dernier message reçu — un message toujours
     * valide, jamais lu, que rien ne rappelle.
     */
    @Test
    fun `revoking a reaction never cancels the message banner of the same conversation`() {
        val messageBanner =
            MessageNotificationId.of(type = "new_message", conversationId = convA, notificationId = n2)

        val revocation = NotificationRevocation(
            notificationIds = listOf(n1),
            conversationIds = listOf(convA),
            types = listOf("message_reaction"),
        )

        assertThat(revocation.notificationManagerIds()).containsExactly(n1.hashCode())
        assertThat(revocation.notificationManagerIds()).doesNotContain(messageBanner)
    }

    @Test
    fun `deleting a message still cancels the banner its conversation indexes`() {
        val revocation = NotificationRevocation(
            notificationIds = listOf(n1),
            conversationIds = listOf(convA),
            types = listOf("new_message"),
        )

        assertThat(revocation.notificationManagerIds())
            .containsExactly(n1.hashCode(), convA.hashCode())
    }

    @Test
    fun `parses the types aligned on the ids`() {
        val revocation = NotificationRevocationParser.parse(
            mapOf(
                "type" to "notification_revoked",
                "notificationIds" to "$n1,$n2",
                "conversationIds" to "$convA,$convA",
                "types" to "message_reaction,new_message",
            ),
        )

        assertThat(revocation?.types).containsExactly("message_reaction", "new_message").inOrder()
        assertThat(revocation?.notificationManagerIds())
            .containsExactly(n1.hashCode(), n2.hashCode(), convA.hashCode())
    }

    /**
     * Fail-safe : un gateway antérieur n'envoie aucun `types`. Sans type, on ne
     * DÉTRUIT pas une bannière voisine — la notification garde son propre index,
     * qui suffit à la retirer dès qu'elle a été affichée sous lui.
     */
    @Test
    fun `a revocation without types cancels nothing by conversation`() {
        val revocation = NotificationRevocationParser.parse(
            mapOf(
                "type" to "notification_revoked",
                "notificationIds" to n1,
                "conversationIds" to convA,
            ),
        )

        assertThat(revocation?.types).isEqualTo(emptyList<String>())
        assertThat(revocation?.notificationManagerIds()).containsExactly(n1.hashCode())
    }
}
