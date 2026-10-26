package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationRowDetailTest {

    private fun notification(
        type: String,
        actorId: String? = "u1",
        metadata: NotificationMetadata? = null,
        context: NotificationContext? = null,
    ) = ApiNotification(
        id = "n1",
        type = type,
        actor = actorId?.let { NotificationActor(id = it, username = "ana") },
        metadata = metadata,
        context = context,
    )

    @Test
    fun `une citation tronquee repete son corps`() {
        assertThat(NotificationRowText.repeats("« Superbe feature qui vient avec… »", "Superbe feature qui vient avec tellement")).isTrue()
    }

    @Test
    fun `distinct retient le premier texte et vide la repetition`() {
        assertThat(NotificationRowText.distinct(listOf("Ana", "salut", "Salut"))).isEqualTo(listOf("Ana", "salut", null))
    }

    @Test
    fun `contact rejoint propose se connecter puis ecrire`() {
        val actions = notification("contact_joined").quickActions(isFriend = false)
        assertThat(actions).isEqualTo(listOf(NotificationQuickAction.Connect("u1"), NotificationQuickAction.Write("u1")))
    }

    @Test
    fun `badge invites venus deja ami n'ecrit que`() {
        val n = notification("badge_earned", metadata = NotificationMetadata(axisKey = "inviteJoined"))
        assertThat(n.quickActions(isFriend = true)).isEqualTo(listOf(NotificationQuickAction.Write("u1")))
        assertThat(n.quickActions(isFriend = false))
            .isEqualTo(listOf(NotificationQuickAction.Write("u1"), NotificationQuickAction.Connect("u1")))
    }

    @Test
    fun `sans acteur aucun geste`() {
        assertThat(notification("contact_joined", actorId = null).quickActions(isFriend = false).isEmpty()).isTrue()
    }

    @Test
    fun `autre type aucun geste`() {
        assertThat(notification("new_message").quickActions(isFriend = false).isEmpty()).isTrue()
    }

    @Test
    fun `reponse a un commentaire porte la citation du parent et un pied de contenu`() {
        val n = notification(
            "comment_reply",
            metadata = NotificationMetadata(parentCommentPreview = "Mon avis", postPreview = "Le post"),
        )
        val detail = NotificationRowDetail.of(n, headline = "Ana a repondu", body = "d'accord")
        assertThat(detail.quote).isEqualTo("Mon avis")
        assertThat(detail.footer).isEqualTo(NotificationRowFooter.Content(RowContentKind.POST, "Le post"))
    }

    @Test
    fun `un pied dont l'extrait repete le corps retombe sur le libelle`() {
        val n = notification("post_like", metadata = NotificationMetadata(postPreview = "Belle vue", postType = "STORY"))
        val detail = NotificationRowDetail.of(n, headline = "Ana", body = "Belle vue")
        assertThat(detail.footer).isEqualTo(NotificationRowFooter.Content(RowContentKind.STORY, null))
    }

    @Test
    fun `message de groupe porte le nom du groupe en pied`() {
        val n = notification("new_message", context = NotificationContext(conversationTitle = "Les Amis", conversationType = "group"))
        assertThat(NotificationRowDetail.of(n, "Ana", "yo").footer).isEqualTo(NotificationRowFooter.Conversation("Les Amis"))
    }

    @Test
    fun `un titre de groupe deja dans la headline se tait`() {
        val n = notification("new_message", context = NotificationContext(conversationTitle = "Les Amis", conversationType = "group"))
        assertThat(NotificationRowDetail.of(n, "Ana dans Les Amis", "yo").footer).isNull()
    }

    @Test
    fun `conversation directe sans pied`() {
        val n = notification("new_message", context = NotificationContext(conversationTitle = "Ana", conversationType = "direct"))
        assertThat(NotificationRowDetail.of(n, "Ana", "yo").footer).isNull()
    }
}
