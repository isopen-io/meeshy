package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushTapDestinationTest {

    private fun resolve(payload: PushPayload, route: String? = null) = PushTapDestination.resolve(payload, route)

    @Test
    fun `un message ouvre sa conversation et surligne le message`() {
        val destination = resolve(PushPayload(type = "new_message", conversationId = "c1", messageId = "m1"))

        assertThat(destination).isEqualTo(PushTapDestination.Conversation("c1", "m1"))
    }

    @Test
    fun `le type en capitales heritees se lit comme le type courant`() {
        assertThat(resolve(PushPayload(type = "NEW_MESSAGE", conversationId = "c1")))
            .isEqualTo(PushTapDestination.Conversation("c1", null))
    }

    @Test
    fun `une mention hors conversation ouvre le post`() {
        assertThat(resolve(PushPayload(type = "user_mentioned", postId = "p1")))
            .isEqualTo(PushTapDestination.Post("p1"))
    }

    @Test
    fun `une charge sans type mais avec conversation garde l ancien chemin`() {
        assertThat(resolve(PushPayload(conversationId = "c1")))
            .isEqualTo(PushTapDestination.Conversation("c1", null))
    }

    @Test
    fun `un commentaire sur un post ouvre le post`() {
        assertThat(resolve(PushPayload(type = "post_comment", postId = "p1", commentId = "k1")))
            .isEqualTo(PushTapDestination.Post("p1"))
    }

    @Test
    fun `un commentaire sur un reel ouvre le reel malgre le nom historique du type`() {
        assertThat(resolve(PushPayload(type = "story_thread_reply", postId = "p1", postType = "REEL")))
            .isEqualTo(PushTapDestination.Reel("p1"))
    }

    @Test
    fun `une reaction a une story ouvre le post de la story`() {
        assertThat(resolve(PushPayload(type = "story_reaction", postId = "p1", postType = "STORY")))
            .isEqualTo(PushTapDestination.Post("p1"))
    }

    @Test
    fun `une nouvelle humeur ouvre sa page`() {
        assertThat(resolve(PushPayload(type = "friend_new_mood", postId = "s1", postType = "MOOD")))
            .isEqualTo(PushTapDestination.Mood("s1"))
    }

    @Test
    fun `une nouvelle story d un ami ouvre le plateau de l auteur`() {
        assertThat(resolve(PushPayload(type = "friend_new_story", postId = "p1", postType = "STORY", senderId = "u1")))
            .isEqualTo(PushTapDestination.Story("u1"))
    }

    @Test
    fun `une demande d ami ouvre le profil de l expediteur`() {
        assertThat(resolve(PushPayload(type = "friend_request", senderId = "u2")))
            .isEqualTo(PushTapDestination.Profile("u2"))
        assertThat(resolve(PushPayload(type = "contact_joined", senderId = "u3")))
            .isEqualTo(PushTapDestination.Profile("u3"))
    }

    @Test
    fun `une demande d ami sans expediteur ouvre les notifications`() {
        assertThat(resolve(PushPayload(type = "friend_request"))).isEqualTo(PushTapDestination.Notifications)
    }

    @Test
    fun `une alerte de compte ouvre la liste des notifications`() {
        listOf("login_new_device", "password_changed", "two_factor_enabled", "security_alert", "system", "report_resolved")
            .forEach { type ->
                assertThat(resolve(PushPayload(type = type))).isEqualTo(PushTapDestination.Notifications)
            }
    }

    @Test
    fun `un indice de route progression ouvre la progression`() {
        assertThat(resolve(PushPayload(type = "level_up"), route = "progression")).isEqualTo(PushTapDestination.Progression)
        assertThat(resolve(PushPayload(type = "game_duo_invited"))).isEqualTo(PushTapDestination.Progression)
    }

    @Test
    fun `un type social sans contenu retombe sur la conversation puis rien`() {
        assertThat(resolve(PushPayload(type = "post_like", conversationId = "c1")))
            .isEqualTo(PushTapDestination.Conversation("c1", null))
        assertThat(resolve(PushPayload(type = "post_like"))).isEqualTo(PushTapDestination.None)
    }

    @Test
    fun `une charge vide n ouvre rien`() {
        assertThat(resolve(PushPayload())).isEqualTo(PushTapDestination.None)
    }
}
