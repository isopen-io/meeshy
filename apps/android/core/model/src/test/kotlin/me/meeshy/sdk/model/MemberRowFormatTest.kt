package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Test

class MemberRowFormatTest {
    private val now = java.time.Instant.parse("2026-11-04T10:00:00Z")
    private fun since(joinedAt: String?) =
        MemberRowFormat.sinceDate(joinedAt, now, ZoneOffset.UTC, Locale.ENGLISH)

    @Test
    fun `date Depuis de l'annee courante rend jour et mois abrege sans annee`() {
        assertThat(since("2026-03-05T08:00:00.000Z")).isEqualTo("5 Mar")
    }

    @Test
    fun `date Depuis d'une autre annee ajoute l'annee sur deux chiffres`() {
        assertThat(since("2024-03-05T08:00:00.000Z")).isEqualTo("5 Mar 24")
    }

    @Test
    fun `date Depuis absente ou illisible ne rend rien`() {
        assertThat(since(null)).isNull()
        assertThat(since("hier")).isNull()
    }

    @Test
    fun `compteur plafonne rend 199+ et sinon le nombre`() {
        assertThat(MemberRowFormat.countText(3, capped = false)).isEqualTo("3")
        assertThat(MemberRowFormat.countText(199, capped = true)).isEqualTo("199+")
    }

    @Test
    fun `le serveur plafonne a 199 membres pour ce lecteur`() {
        assertThat(MemberRowFormat.isCapped(199)).isTrue()
        assertThat(MemberRowFormat.isCapped(198)).isFalse()
    }

    @Test
    fun `libelle de role Admin pour createur et admin Modo pour moderateur rien pour membre`() {
        assertThat(MemberRowFormat.badge(MemberRole.CREATOR)).isEqualTo(MemberRoleBadge.ADMIN)
        assertThat(MemberRowFormat.badge(MemberRole.ADMIN)).isEqualTo(MemberRoleBadge.ADMIN)
        assertThat(MemberRowFormat.badge(MemberRole.MODERATOR)).isEqualTo(MemberRoleBadge.MODERATOR)
        assertThat(MemberRowFormat.badge(MemberRole.MEMBER)).isNull()
    }
}
