package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La règle de la bannière in-app (directive iOS `allowsInAppBanner`) : seuls les interrupteurs PAR
 * TYPE, la conversation ouverte et le dédoublonnage la gouvernent. `pushEnabled` et la fenêtre Ne
 * pas déranger protègent l'utilisateur ABSENT du PUSH ; ici il est devant l'écran.
 */
class NotificationToastPolicyTest {

    private fun notification(
        id: String = "n1",
        type: String = "system",
        conversationId: String? = "c1",
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    private fun decide(
        notification: ApiNotification = notification(),
        openConversationIds: Set<String> = emptySet(),
        isDuplicateDelivery: Boolean = false,
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
    ) = NotificationToastPolicy.decide(notification, openConversationIds, isDuplicateDelivery, preferences)

    @Test
    fun `une notification ordinaire s'affiche`() {
        assertThat(decide()).isEqualTo(NotificationToastDecision.Show(notification()))
    }

    @Test
    fun `la conversation ouverte ne se signale jamais`() {
        assertThat(decide(openConversationIds = setOf("c1")))
            .isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }

    @Test
    fun `la conversation ouverte dans une autre fenetre est aussi silencieuse`() {
        assertThat(decide(openConversationIds = setOf("c0", "c1", "c2")))
            .isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }

    @Test
    fun `une autre conversation ouverte ne supprime pas`() {
        assertThat(decide(openConversationIds = setOf("c2"))).isInstanceOf(NotificationToastDecision.Show::class.java)
    }

    @Test
    fun `un post ou une story a l'ecran n'empeche plus la banniere`() {
        val target = notification(conversationId = null, postId = "p1")
        assertThat(decide(notification = target)).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun `un doublon APN plus socket est dedoublonne`() {
        assertThat(decide(isDuplicateDelivery = true)).isEqualTo(NotificationToastDecision.Deduplicated)
    }

    @Test
    fun `push coupe la banniere s'affiche quand meme`() {
        assertThat(decide(preferences = UserNotificationPreferences(pushEnabled = false)))
            .isInstanceOf(NotificationToastDecision.Show::class.java)
    }

    @Test
    fun `fenetre Ne pas deranger active la banniere s'affiche quand meme`() {
        val prefs = UserNotificationPreferences(dndEnabled = true, dndStartTime = "00:00", dndEndTime = "23:59")
        assertThat(decide(preferences = prefs)).isInstanceOf(NotificationToastDecision.Show::class.java)
    }

    @Test
    fun `un type dont l'interrupteur est coupe reste muet`() {
        assertThat(decide(notification = notification(type = "member_left")))
            .isEqualTo(NotificationToastDecision.BlockedByPreferences)
    }

    @Test
    fun `un type dont l'interrupteur est actif s'affiche`() {
        val target = notification(type = "new_message")
        assertThat(decide(notification = target)).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun `un type sans interrupteur survit aux interrupteurs voisins coupes`() {
        val target = notification(type = "translation_completed")
        val prefs = UserNotificationPreferences(systemEnabled = false, reactionEnabled = false)
        assertThat(decide(notification = target, preferences = prefs)).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun `la conversation ouverte l'emporte sur le dedoublonnage et les preferences`() {
        val prefs = UserNotificationPreferences(systemEnabled = false)
        assertThat(decide(openConversationIds = setOf("c1"), isDuplicateDelivery = true, preferences = prefs))
            .isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }
}
