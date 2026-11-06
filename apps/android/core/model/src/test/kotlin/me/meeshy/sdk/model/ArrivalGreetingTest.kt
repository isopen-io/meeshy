package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #16338 — « dis-lui salut » écrit les @mentions des arrivants dans le composeur. */
class ArrivalGreetingTest {

    @Test
    fun `un arrivant donne sa mention suivie d'une espace`() {
        assertThat(ArrivalGreeting.mentions(listOf("awa"))).isEqualTo("@awa ")
    }

    @Test
    fun `plusieurs arrivants donnent toutes leurs mentions, dans l'ordre, sans doublon ni pseudo vide`() {
        assertThat(ArrivalGreeting.mentions(listOf("awa", null, " ", "@tom", "awa", "lea"))).isEqualTo("@awa @tom @lea ")
    }

    @Test
    fun `personne a saluer, aucune mention`() {
        assertThat(ArrivalGreeting.mentions(listOf(null, ""))).isNull()
    }

    @Test
    fun `un composeur vide recoit les mentions telles quelles`() {
        assertThat(ArrivalGreeting.inserted(draft = "", mentions = "@awa @tom ")).isEqualTo("@awa @tom ")
    }

    @Test
    fun `un brouillon en cours garde son texte et recoit les mentions a la suite`() {
        assertThat(ArrivalGreeting.inserted(draft = "Bienvenue", mentions = "@awa ")).isEqualTo("Bienvenue @awa ")
    }

    @Test
    fun `une mention deja ecrite ne se repete pas`() {
        assertThat(ArrivalGreeting.inserted(draft = "@awa ", mentions = "@awa @tom ")).isEqualTo("@awa @tom ")
    }

    @Test
    fun `la phrase d'arrivees se separe de son invite au dernier tiret`() {
        assertThat(ArrivalGreeting.splitInvite("Awa et Tom viennent d’arriver — dis-leur salut"))
            .isEqualTo(ArrivalGreeting.Split(lead = "Awa et Tom viennent d’arriver — ", invite = "dis-leur salut"))
        assertThat(ArrivalGreeting.splitInvite("وصل Awa للتو — قل مرحبًا").invite).isEqualTo("قل مرحبًا")
    }

    @Test
    fun `une phrase sans invite reste entiere`() {
        assertThat(ArrivalGreeting.splitInvite("Awa est arrivée")).isEqualTo(ArrivalGreeting.Split(lead = "Awa est arrivée", invite = null))
    }

    @Test
    fun `l'avis d'arrivee d'un compte se salue par son pseudo, jamais un visiteur sans compte ni soi-meme`() {
        val awa = JoinNoticeMetadata(participantId = "p1", displayName = "Awa", username = "awa")
        assertThat(ArrivalGreeting.handleOf(awa, isOwn = false)).isEqualTo("awa")
        assertThat(ArrivalGreeting.handleOf(awa, isOwn = true)).isNull()
        assertThat(ArrivalGreeting.handleOf(awa.copy(isAnonymous = true, username = "ano_x"), isOwn = false)).isNull()
        assertThat(ArrivalGreeting.handleOf(awa.copy(username = null), isOwn = false)).isNull()
    }

    @Test
    fun `les arrivees groupees se resolvent par la participation, les inconnus sont ecartes`() {
        val notice = ArrivalsNoticeMetadata(
            arrivals = listOf(
                ArrivalsNoticeMetadata.Arrival("p2", "Tom"),
                ArrivalsNoticeMetadata.Arrival("p9", "Inconnu"),
                ArrivalsNoticeMetadata.Arrival("p1", "Awa"),
            ),
            count = 3,
            windowStartedAt = "2026-11-05T10:00:00Z",
        )

        assertThat(ArrivalGreeting.handlesOf(notice, mapOf("p1" to "awa", "p2" to "tom"))).containsExactly("tom", "awa").inOrder()
    }
}
