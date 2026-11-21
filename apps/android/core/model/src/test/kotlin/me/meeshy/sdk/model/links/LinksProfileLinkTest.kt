package me.meeshy.sdk.model.links

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LinksProfileLinkTest {

    @Test
    fun `le lien de profil vient du lien canonique et se montre sans schema`() {
        val link = LinksProfileLink.from("@Aissa")

        assertThat(link?.webLink).isEqualTo("https://meeshy.me/u/Aissa")
        assertThat(link?.shown).isEqualTo("meeshy.me/u/Aissa")
        assertThat(link?.handle).isEqualTo("Aissa")
    }

    @Test
    fun `sans pseudo il n'y a pas de lien a partager`() {
        assertThat(LinksProfileLink.from("  ")).isNull()
        assertThat(LinksProfileLink.from(null)).isNull()
        assertThat(LinksProfileLink.from("@")).isNull()
    }
}
