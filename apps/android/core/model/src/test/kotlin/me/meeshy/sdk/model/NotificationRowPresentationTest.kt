package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationRowPresentationTest {

    private fun notification(
        type: String,
        actor: NotificationActor? = NotificationActor(id = "u1", username = "ana"),
        title: String? = null,
        content: String? = null,
        subtitle: String? = null,
        metadata: NotificationMetadata? = null,
        context: NotificationContext? = null,
    ) = ApiNotification(
        id = "n1", type = type, title = title, content = content, subtitle = subtitle,
        actor = actor, metadata = metadata, context = context,
    )

    private val now = 1_800_000_000_000L

    @Test
    fun `un message garde l'avatar de l'acteur`() {
        val p = NotificationRowPresentation.of(notification("new_message"), "Ana", "yo", now)
        assertThat(p.leading).isEqualTo(RowLeading.Avatar)
    }

    @Test
    fun `un palier de niveau porte son medaillon`() {
        val n = notification("level_up", metadata = NotificationMetadata(level = 7))
        val p = NotificationRowPresentation.of(n, "Niveau", null, now)
        assertThat(p.leading).isEqualTo(RowLeading.Milestone(NotificationMilestone.Level(7)))
        assertThat(p.footer).isNull()
    }

    @Test
    fun `une serie et un badge sont des paliers, un badge sans axe non`() {
        assertThat(NotificationRowPresentation.milestone(notification("streak_milestone", metadata = NotificationMetadata(threshold = 30))))
            .isEqualTo(NotificationMilestone.Streak(30))
        assertThat(NotificationRowPresentation.milestone(notification("badge_earned", metadata = NotificationMetadata(axisKey = "inviteJoined", threshold = 5))))
            .isEqualTo(NotificationMilestone.Badge("inviteJoined", 5))
        assertThat(NotificationRowPresentation.milestone(notification("badge_earned"))).isNull()
    }

    @Test
    fun `un palier servi avec son rang rend le titre et la raison du serveur`() {
        val n = notification(
            "badge_earned", title = "Ambassadeur", content = "5 amis invités",
            metadata = NotificationMetadata(axisKey = "inviteJoined", tierRank = 2),
        )
        val p = NotificationRowPresentation.of(n, "Badge", null, now)
        assertThat(p.title).isEqualTo("Ambassadeur")
        assertThat(p.body).isEqualTo("5 amis invités")
    }

    @Test
    fun `un palier sans rang prend le repli localise puis la headline`() {
        val n = notification("level_up", title = "ignoré", metadata = NotificationMetadata(level = 3))
        val copy = object : NotificationRowCopy {
            override fun milestoneName(milestone: NotificationMilestone) = "Niveau 3"
            override fun milestoneReason(milestone: NotificationMilestone, inviteeName: String?) = null
        }
        assertThat(NotificationRowPresentation.of(n, "Headline", null, now, copy).title).isEqualTo("Niveau 3")
        assertThat(NotificationRowPresentation.of(n, "Headline", null, now).title).isEqualTo("Headline")
    }

    @Test
    fun `un jeu sans acteur et un systeme sans acteur portent la signature`() {
        assertThat(NotificationRowPresentation.of(notification("game_league_result", actor = null), "Ligue", null, now).leading)
            .isEqualTo(RowLeading.Signature)
        assertThat(NotificationRowPresentation.of(notification("security_alert", actor = null), "Sécurité", null, now).leading)
            .isEqualTo(RowLeading.Signature)
        assertThat(NotificationRowPresentation.of(notification("security_alert"), "Sécurité", null, now).leading)
            .isEqualTo(RowLeading.Avatar)
    }

    @Test
    fun `le pied d'un contenu lie dit la date et l'expiration`() {
        val n = notification(
            "story_reaction",
            metadata = NotificationMetadata(postPreview = "Belle vue"),
            context = NotificationContext(postCreatedAt = "2026-01-01T10:00:00Z", postExpiresAt = "2026-01-02T10:00:00Z"),
        )
        val footer = NotificationRowPresentation.of(n, "Ana", null, now).footer as NotificationRowFooter.Content
        assertThat(footer.isExpired).isTrue()
        assertThat(footer.publishedAtMillis).isNotNull()
        assertThat(footer.excerpt).isEqualTo("Belle vue")
    }

    @Test
    fun `un contenu non expire reste normal`() {
        val n = notification("post_like", context = NotificationContext(postExpiresAt = "2999-01-01T00:00:00Z"))
        val footer = NotificationRowPresentation.of(n, "Ana", null, now).footer as NotificationRowFooter.Content
        assertThat(footer.isExpired).isFalse()
    }

    @Test
    fun `le contexte serveur devient un pied simple sauf redite`() {
        val n = notification("system", actor = null, subtitle = "Maintenance prévue")
        assertThat(NotificationRowPresentation.of(n, "Meeshy", null, now).footer).isEqualTo(NotificationRowFooter.Plain("Maintenance prévue"))
        assertThat(NotificationRowPresentation.of(n, "Meeshy Maintenance prévue", null, now).footer).isNull()
    }

    @Test
    fun `la citation d'une reponse qui redit le corps se tait`() {
        val n = notification("comment_reply", metadata = NotificationMetadata(parentCommentPreview = "Mon avis"))
        val same = NotificationRowPresentation.of(n, "Ana a répondu", "Mon avis", now)
        assertThat(same.body).isEqualTo("Mon avis")
        assertThat(same.quote).isNull()
        val other = NotificationRowPresentation.of(n, "Ana a répondu", "D'accord", now)
        assertThat(other.quote).isEqualTo("Mon avis")
    }

    @Test
    fun `le libelle d'accessibilite prefixe non lu et saute les pieces vides`() {
        val p = NotificationRowPresentation(RowLeading.Avatar, "Ana", null, "citation", null)
        assertThat(p.accessibilityDescription(true, "Non lu.", null, "2 min")).isEqualTo("Non lu. Ana. citation. 2 min")
        assertThat(p.accessibilityDescription(false, "Non lu.", "Groupe", null)).isEqualTo("Ana. citation. Groupe")
    }
}
