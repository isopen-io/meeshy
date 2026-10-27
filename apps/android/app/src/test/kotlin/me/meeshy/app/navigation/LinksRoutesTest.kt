package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.navigation.graph.LinksRoutes
import org.junit.Test

class LinksRoutesTest {

    @Test
    fun `les routes de Mes liens sont figees`() {
        assertThat(LinksRoutes.HUB).isEqualTo("links")
        assertThat(LinksRoutes.TRACKING).isEqualTo("tracking-links?create={create}")
        assertThat(LinksRoutes.TRACKING_DETAIL).isEqualTo("tracking-links/{token}")
        assertThat(LinksRoutes.COMMUNITY).isEqualTo("community-links")
        assertThat(LinksRoutes.COMMUNITY_DETAIL).isEqualTo("community-links/{communityId}")
        assertThat(LinksRoutes.AFFILIATE).isEqualTo("affiliate?create={create}")
    }

    @Test
    fun `les constructeurs rendent des adresses que les patterns reconnaissent`() {
        assertThat(LinksRoutes.tracking()).isEqualTo("tracking-links?create=false")
        assertThat(LinksRoutes.tracking(create = true)).isEqualTo("tracking-links?create=true")
        assertThat(LinksRoutes.trackingDetail("abc123")).isEqualTo("tracking-links/abc123")
        assertThat(LinksRoutes.communityDetail("c1")).isEqualTo("community-links/c1")
        assertThat(LinksRoutes.affiliate(create = true)).isEqualTo("affiliate?create=true")
    }

    @Test
    fun `le barreau Mes liens du menu ouvre le hub et non plus la seule liste de partage`() {
        val chrome = File("src/main/kotlin/me/meeshy/app/navigation/RootFloatingChrome.kt").readText()
        assertThat(chrome).contains("RootMenuLadderEntry.LINKS -> navigate(LinksRoutes.HUB)")
    }
}
