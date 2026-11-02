package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ShareLinkArrivalsTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `une page serveur se lit avec la date d arrivee joinedAt et son curseur`() {
        val page = json.decodeFromString<ShareLinkArrivalsPage>(
            """{"arrivals":[{"displayName":"Ana","avatar":null,"isAnonymous":true,"country":"FR","language":"fr","joinedAt":"2026-10-20T10:00:00.000Z"}],"nextCursor":"abc"}""",
        )
        val entry = page.arrivals.single()
        assertThat(entry.displayName).isEqualTo("Ana")
        assertThat(entry.isAnonymous).isTrue()
        assertThat(entry.joinedAtMillis).isEqualTo(1_792_490_400_000L)
        assertThat(page.cursorOrNull).isEqualTo("abc")
    }

    @Test
    fun `une arrivee illisible est sautee et la page reste`() {
        val page = json.decodeFromString<ShareLinkArrivalsPage>(
            """{"arrivals":[{"displayName":"Ana","joinedAt":"2026-10-20T10:00:00.000Z"},{"displayName":{"x":1}},{"displayName":"Bo","joinedAt":"2026-10-20T09:00:00.000Z"}],"nextCursor":null}""",
        )
        assertThat(page.arrivals.map { it.displayName }).containsExactly("Ana", "Bo").inOrder()
    }

    @Test
    fun `un curseur vide vaut la fin de la liste`() {
        val page = json.decodeFromString<ShareLinkArrivalsPage>("""{"arrivals":[],"nextCursor":""}""")
        assertThat(page.cursorOrNull).isNull()
    }

    @Test
    fun `deux arrivees indiscernables a l ecran n en font qu une`() {
        val a = ShareLinkArrivalEntry(displayName = "Ana", country = "FR", language = "fr", joinedAt = "2026-10-20T10:00:00.000Z")
        val b = a.copy(participantId = "p1")
        assertThat(a.key).isEqualTo(b.key)
        assertThat(a.copy(displayName = "Bo").key).isNotEqualTo(a.key)
    }

    @Test
    fun `les statistiques gardent les arrivees recentes avec leur participant`() {
        val stats = json.decodeFromString<ShareLinkArrivalStats>(
            """{"visits":9,"arrivals":4,"anonymousArrivals":1,"arrivalsByLanguage":[{"language":"fr","count":3},{"language":"en","count":1}],"recentArrivals":[{"participantId":"p1","displayName":"Ana","isAnonymous":false,"joinedAt":"2026-10-20T10:00:00.000Z"}]}""",
        )
        assertThat(stats.recentArrivals.single().participantId).isEqualTo("p1")
        assertThat(stats.languageShares.map { it.code }).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `le lien vers la liste complete n apparait que s il montre plus que la carte`() {
        fun stats(total: Int, recent: Int) = ShareLinkArrivalStats(
            arrivals = total,
            recentArrivals = List(recent) { ShareLinkArrivalEntry(displayName = "n$it", joinedAt = "2026-10-20T10:00:0$it.000Z") },
        )
        assertThat(ShareLinkArrivalsSection.showsSeeAll(stats(total = 3, recent = 3))).isFalse()
        assertThat(ShareLinkArrivalsSection.showsSeeAll(stats(total = 20, recent = 10))).isTrue()
        assertThat(ShareLinkArrivalsSection.showsSeeAll(stats(total = 8, recent = 8))).isFalse()
        assertThat(ShareLinkArrivalsSection.showsSeeAll(stats(total = 9, recent = 8))).isTrue()
    }
}

class ShareLinkStatsStateTest {
    @Test
    fun `des chiffres en main se montrent meme si le rafraichissement echoue`() {
        val stats = ShareLinkArrivalStats(visits = 3)
        assertThat(ShareLinkStatsState.of(stats, refreshFailed = true)).isEqualTo(ShareLinkStatsState.Loaded(stats))
    }

    @Test
    fun `sans chiffres le chargement devient indisponible a l echec`() {
        assertThat(ShareLinkStatsState.of(null, refreshFailed = false)).isEqualTo(ShareLinkStatsState.Loading)
        assertThat(ShareLinkStatsState.of(null, refreshFailed = true)).isEqualTo(ShareLinkStatsState.Unavailable)
    }
}
