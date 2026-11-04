package me.meeshy.sdk.model.links

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LinksHubCategoriesTest {

    @Test
    fun `quatre categories dans l'ordre d'iOS`() {
        assertThat(LinksHubEntry.entries)
            .containsExactly(LinksHubEntry.SHARE, LinksHubEntry.TRACKING, LinksHubEntry.COMMUNITY, LinksHubEntry.AFFILIATE)
            .inOrder()
    }

    @Test
    fun `chaque categorie porte son accent propre`() {
        assertThat(LinksHubEntry.entries.map { it.accentHex }.toSet()).hasSize(4)
        assertThat(LinksHubEntry.SHARE.accentHex).isEqualTo("818CF8")
        assertThat(LinksHubEntry.TRACKING.accentHex).isEqualTo("4F46E5")
        assertThat(LinksHubEntry.COMMUNITY.accentHex).isEqualTo("FBBF24")
        assertThat(LinksHubEntry.AFFILIATE.accentHex).isEqualTo("34D399")
    }

    @Test
    fun `les categories de partage, suivi et parrainage se creent depuis la carte`() {
        assertThat(LinksHubEntry.entries.filter { it.canCreate })
            .containsExactly(LinksHubEntry.SHARE, LinksHubEntry.TRACKING, LinksHubEntry.AFFILIATE)
    }
}
