package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class CommunityLinkTest {
    @Test
    fun `l'URL de partage canonique est chat identifiant`() {
        val link = CommunityLink.of("c1", "Café", "mshy-cafe", "https://meeshy.me", 4, true)
        assertThat(link.joinUrl).isEqualTo("https://meeshy.me/chat/mshy-cafe")
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
