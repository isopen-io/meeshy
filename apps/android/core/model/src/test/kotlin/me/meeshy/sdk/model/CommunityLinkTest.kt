package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class CommunityLinkTest {
    @Test
    fun `l'adresse partagee est la page de la communaute marquee via link`() {
        val link = CommunityLink.of("c1", "Café", "mshy-cafe", "https://meeshy.me", 4, true)
        assertThat(link.joinUrl).isEqualTo("https://meeshy.me/communities/mshy-cafe?via=link")
    }

    @Test
    fun `un identifiant se code dans l'adresse`() {
        val link = CommunityLink.of("c1", "Café", "café club", "https://meeshy.me/", 4, true)
        assertThat(link.joinUrl).isEqualTo("https://meeshy.me/communities/caf%C3%A9%20club?via=link")
    }

    @Test
    fun `les statistiques de lien sont decodees`() {
        val stats = Json { ignoreUnknownKeys = true }.decodeFromString(
            CommunityLinkStats.serializer(),
            """{"totalCommunities":3,"totalMembers":42,"activeCommunities":2,"extra":1}""",
        )
        assertThat(stats).isEqualTo(CommunityLinkStats(3, 42, 2))
    }
}
