package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyAddressTest {

    private fun wire(
        id: String = "a1",
        title: String = "Site",
        url: String = "https://aissandiaye.studio",
        glyph: String? = "site",
        position: Int = 0,
        isShown: Boolean? = true,
        clicks: Int? = 0,
    ) = MyAddressWire(id = id, title = title, url = url, glyph = glyph, position = position, isShown = isShown, clicks = clicks)

    @Test
    fun `une adresse web publique se lit telle quelle avec son glyphe et ses clics`() {
        val decoded = MyAddresses.decode(listOf(wire(title = "Musique", url = "https://soundcloud.com/aissa", glyph = "music", clicks = 12)))

        assertThat(decoded).hasSize(1)
        assertThat(decoded.single().glyph).isEqualTo(MyAddressGlyph.MUSIC)
        assertThat(decoded.single().clicks).isEqualTo(12)
        assertThat(decoded.single().url).isEqualTo("https://soundcloud.com/aissa")
    }

    @Test
    fun `une adresse sans schema devient https`() {
        assertThat(MyAddresses.decode(listOf(wire(url = "aissandiaye.studio"))).single().url).isEqualTo("https://aissandiaye.studio")
    }

    @Test
    fun `jamais de lien javascript data, d'identifiants, d'adresse IP ni de nom interne`() {
        val unsafe = listOf(
            "javascript:alert(1)", "data:text/html,x", "ftp://example.com", "https://user:pw@example.com",
            "http://10.0.0.1/", "http://localhost/", "https://printer.local/", "https://exemple", "https://[::1]/",
        )

        assertThat(MyAddresses.decode(unsafe.mapIndexed { index, url -> wire(id = "u$index", url = url) })).isEmpty()
    }

    @Test
    fun `une adresse sans titre ou sans identifiant est ecartee`() {
        assertThat(MyAddresses.decode(listOf(wire(title = "  "), wire(id = "")))).isEmpty()
    }

    @Test
    fun `un glyphe inconnu d'une version plus recente retombe sur le site`() {
        assertThat(MyAddresses.decode(listOf(wire(glyph = "hologramme"))).single().glyph).isEqualTo(MyAddressGlyph.SITE)
        assertThat(MyAddresses.decode(listOf(wire(glyph = null))).single().glyph).isEqualTo(MyAddressGlyph.SITE)
    }

    @Test
    fun `les adresses se rangent par position et une adresse masquee reste pour son proprietaire`() {
        val decoded = MyAddresses.decode(
            listOf(wire(id = "b", position = 2, isShown = false), wire(id = "a", position = 1), wire(id = "c", position = 0)),
        )

        assertThat(decoded.map { it.id }).containsExactly("c", "a", "b").inOrder()
        assertThat(decoded.last().isShown).isFalse()
    }

    @Test
    fun `l'hote affiche d'une adresse n'a ni schema ni www ni chemin`() {
        assertThat(MyAddresses.host("https://www.instagram.com/aissa.snd?x=1")).isEqualTo("instagram.com")
        assertThat(MyAddresses.host("https://aissandiaye.studio/")).isEqualTo("aissandiaye.studio")
    }
}
