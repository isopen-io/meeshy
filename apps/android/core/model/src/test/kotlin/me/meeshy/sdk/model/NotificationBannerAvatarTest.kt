package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #12569 — le visage d'une bannière in-app (miroir d'iOS `toastAvatarURL` / `toastAvatarName`) : la
 * photo de l'acteur ; à défaut, en GROUPE seulement, celle du groupe, et ce sont alors les initiales
 * du groupe qui tiennent sa place. Un direct ne prête jamais la photo de sa conversation.
 */
class NotificationBannerAvatarTest {

    private fun notification(
        actorAvatar: String? = null,
        groupAvatar: String? = "2026/09/g/photo.png",
        title: String? = "Les Amis",
    ) = ApiNotification(
        id = "n1",
        actor = NotificationActor(id = "u1", username = "alice", displayName = "Alice Martin", avatar = actorAvatar),
        context = NotificationContext(conversationTitle = title, conversationAvatar = groupAvatar),
    )

    @Test
    fun `la photo de l'acteur l'emporte, meme dans un groupe qui a la sienne`() {
        val avatar = NotificationBannerAvatar.of(
            notification(actorAvatar = "2026/09/a/photo.png"),
            actorName = "Alice Martin",
            isDirect = false,
        )

        assertThat(avatar).isEqualTo(NotificationBannerAvatar(name = "Alice Martin", url = "2026/09/a/photo.png"))
    }

    @Test
    fun `en groupe sans photo d'acteur, la photo du groupe porte les initiales du groupe`() {
        val avatar = NotificationBannerAvatar.of(notification(), actorName = "Alice Martin", isDirect = false)

        assertThat(avatar).isEqualTo(NotificationBannerAvatar(name = "Les Amis", url = "2026/09/g/photo.png"))
    }

    @Test
    fun `le nom local du groupe donne ses initiales quand il est connu`() {
        val avatar = NotificationBannerAvatar.of(
            notification(),
            actorName = "Alice Martin",
            isDirect = false,
            groupName = "Famille",
        )

        assertThat(avatar.name).isEqualTo("Famille")
    }

    @Test
    fun `un direct ne prete jamais la photo de sa conversation`() {
        val avatar = NotificationBannerAvatar.of(
            notification(groupAvatar = "legacy.png", title = "Alice et Moi"),
            actorName = "Alice Martin",
            isDirect = true,
        )

        assertThat(avatar).isEqualTo(NotificationBannerAvatar(name = "Alice Martin", url = null))
    }

    @Test
    fun `une photo blanche n'est pas une photo`() {
        val avatar = NotificationBannerAvatar.of(
            notification(actorAvatar = "  ", groupAvatar = " "),
            actorName = "Alice Martin",
            isDirect = false,
        )

        assertThat(avatar).isEqualTo(NotificationBannerAvatar(name = "Alice Martin", url = null))
    }

    @Test
    fun `un groupe sans nom garde les initiales de l'acteur`() {
        val avatar = NotificationBannerAvatar.of(notification(title = "  "), actorName = "Alice Martin", isDirect = false)

        assertThat(avatar).isEqualTo(NotificationBannerAvatar(name = "Alice Martin", url = "2026/09/g/photo.png"))
    }

    @Test
    fun `direct et dm sont les deux noms du fil a deux, quelle que soit la casse`() {
        assertThat(isDirectConversationType("direct")).isTrue()
        assertThat(isDirectConversationType("DM")).isTrue()
        assertThat(isDirectConversationType("group")).isFalse()
        assertThat(isDirectConversationType(null)).isFalse()
    }
}
