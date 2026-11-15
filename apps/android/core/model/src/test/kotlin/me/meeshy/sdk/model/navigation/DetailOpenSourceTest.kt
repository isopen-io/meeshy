package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.analytics.ContentEntry
import org.junit.Test

class DetailOpenSourceTest {
    private class Clock(var now: Long = 1_000L)

    private fun sources(clock: Clock = Clock()) = DetailOpenSource { clock.now }

    @Test
    fun `sans marque l entree est directe`() {
        assertThat(sources().consumeEntry("p1")).isEqualTo(ContentEntry.direct)
        assertThat(sources().consumeMarkedEntry("p1")).isNull()
    }

    @Test
    fun `la marque se lit une seule fois`() {
        val s = sources()
        s.markOpenedFromNotification("p1")
        assertThat(s.consumeMarkedEntry("p1")).isEqualTo(ContentEntry.notification)
        assertThat(s.consumeMarkedEntry("p1")).isNull()
    }

    @Test
    fun `la marque vit soixante secondes`() {
        val clock = Clock()
        val s = sources(clock)
        s.mark("p1", ContentEntry.sharedLink)
        clock.now += 60_000L
        assertThat(s.consumeMarkedEntry("p1")).isEqualTo(ContentEntry.sharedLink)
        s.mark("p2", ContentEntry.sharedLink)
        clock.now += 60_001L
        assertThat(s.consumeMarkedEntry("p2")).isNull()
    }

    @Test
    fun `une marque perimee consommee ne laisse rien`() {
        val clock = Clock()
        val s = sources(clock)
        s.mark("p1", ContentEntry.notification)
        clock.now += 61_000L
        s.consumeMarkedEntry("p1")
        assertThat(s.markCount).isEqualTo(0)
    }

    @Test
    fun `chaque nouvelle marque purge les perimees`() {
        val clock = Clock()
        val s = sources(clock)
        s.mark("old", ContentEntry.notification)
        clock.now += 61_000L
        s.mark("new", ContentEntry.notification)
        assertThat(s.markCount).isEqualTo(1)
    }

    @Test
    fun `un identifiant vide n est pas marque`() {
        val s = sources()
        s.mark("", ContentEntry.notification)
        assertThat(s.markCount).isEqualTo(0)
    }

    @Test
    fun `la source d impression suit l entree`() {
        val s = sources()
        s.markOpenedFromNotification("p1")
        assertThat(s.consumeSource("p1")).isEqualTo(DetailOpenSource.NOTIFICATION_SOURCE)
        assertThat(s.consumeSource("p1")).isEqualTo(DetailOpenSource.DETAIL_SOURCE)
    }
}
