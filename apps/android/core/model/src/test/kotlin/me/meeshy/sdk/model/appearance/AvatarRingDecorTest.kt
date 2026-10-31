package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.appearance.AppearanceFixtures.array
import me.meeshy.sdk.model.appearance.AppearanceFixtures.parse
import me.meeshy.sdk.model.appearance.AppearanceFixtures.ringJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Test

/**
 * #13960 — les calques illustrés d'un contour (miroir de `AvatarRingDecorSchema` et d'`AvatarRingDecor.swift`) :
 * un film DERRIÈRE l'avatar, un film AU-DESSUS, et leur débordement. Lus quand ils sont valides, ignorés sinon —
 * jamais cause de refus du contour, dont l'anneau fixe reste l'image de repli.
 */
class AvatarRingDecorTest {

    private fun ref(letter: Char) = """{"src":"${letter.toString().repeat(16)}.json","bytes":1200,"sha256":"${letter.toString().repeat(64)}"}"""

    private fun read(ring: JsonObject): AvatarRingDesign? {
        val pack = parse("""{"slug":"cadres","rings":[]}""").with("rings" to array(ring, ringJson("voisin")))
        val rings = AppearanceFixtures.json.decodeFromString(AvatarRingPack.serializer(), pack.toString()).rings
        assertThat(rings.map { it.key }).contains("voisin")
        return rings.firstOrNull { it.key == ring["key"]!!.jsonPrimitive.content }
    }

    private fun withDecor(text: String): JsonObject = ringJson("masque").with("decor" to parse(text))

    @Test
    fun `a ring reads its back film, its front film and its reach`() {
        val decor = read(withDecor("""{"reach":1.4,"back":${ref('a')},"front":${ref('b')}}"""))?.decor

        assertThat(decor?.reach).isEqualTo(1.4)
        assertThat(decor?.back?.src).isEqualTo("aaaaaaaaaaaaaaaa.json")
        assertThat(decor?.front?.src).isEqualTo("bbbbbbbbbbbbbbbb.json")
    }

    @Test
    fun `a ring without decor stays the ring of before`() {
        assertThat(read(ringJson("masque"))?.decor).isNull()
    }

    @Test
    fun `an unreadable decor is ignored and the ring stays`() {
        listOf(
            """{"reach":3,"front":${ref('b')}}""",
            """{"reach":1.2}""",
            """{"reach":1.2,"front":{"src":"../x"}}""",
        ).forEach { text ->
            val ring = read(withDecor(text))
            assertThat(ring).isNotNull()
            assertThat(ring?.decor).isNull()
        }
    }

    @Test
    fun `the film is centred and reach times the ring box`() {
        val decor = read(withDecor("""{"reach":1.4,"front":${ref('b')}}"""))?.decor

        assertThat(decor?.side(100f)).isWithin(0.001f).of(140f)
    }

    @Test
    fun `the embedded catalog carries the showcase of illustrated frames, each with both films`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())
        val pack = catalog.ringPacks.first { it.slug == "cadres-illustres" }

        assertThat(pack.installedByDefault).isTrue()
        assertThat(pack.rings.map { it.key }).containsExactly("masque-felin", "toile-araignee", "ailes-ange", "cercle-runique", "griffes-os", "ailes-demon").inOrder()
        pack.rings.forEach { ring ->
            assertThat(ring.decor?.reach).isEqualTo(1.4)
            assertThat(ring.decor?.back).isNotNull()
            assertThat(ring.decor?.front).isNotNull()
        }
    }
}
