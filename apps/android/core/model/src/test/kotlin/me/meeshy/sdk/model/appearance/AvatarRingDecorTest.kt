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

    private fun decor(reach: Double = 1.4) = checkNotNull(read(withDecor("""{"reach":$reach,"front":${ref('b')}}"""))?.decor)

    @Test
    fun `without declared room the frame holds inside the plain ring box, everything shrinking together (#15157)`() {
        val fit = decor().fit(100.0)

        assertThat(fit.scale).isWithin(1e-9).of(1 / 1.4)
        assertThat(fit.side).isWithin(1e-9).of(100.0)
        assertThat(fit.offset).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `the room the host declares free is taken, never more than the film asks (#15157)`() {
        val partial = decor().fit(100.0, room = 10.0)
        assertThat(partial.side).isWithin(1e-9).of(120.0)
        assertThat(partial.scale).isWithin(1e-9).of(120.0 / 140)
        assertThat(partial.offset).isWithin(1e-9).of(-10.0)
        assertThat(decor().fit(100.0, room = 40.0).scale).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `the film never paints past the box plus the room, at every size (#15157)`() {
        listOf(18.0, 22.0, 28.0, 44.0, 62.0, 88.0, 107.0, 140.0).forEach { box ->
            listOf(1.0, 1.2, 1.4, AvatarRingDecor.MAX_REACH).forEach { reach ->
                listOf(0.0, 4.0, 12.0).forEach { room ->
                    decor(reach).fit(box, room).let { fit ->
                        assertThat(fit.side).isAtMost(box + 2 * room + 1e-9)
                        assertThat(fit.side).isWithin(1e-9).of(box * reach * fit.scale)
                        assertThat(fit.scale).isAtMost(1.0)
                    }
                }
            }
        }
    }

    @Test
    fun `the frame sits whole at every size, list, bubble and mini avatar included (#16114)`() {
        assertThat(decor().fit(52.0).side).isWithin(1e-9).of(52.0)
        assertThat(decor().fit(52.0).scale).isWithin(1e-9).of(1 / 1.4)
        assertThat(decor(1.0).fit(32.0).scale).isWithin(1e-9).of(1.0)
        assertThat(decor(AvatarRingDecor.MAX_REACH).fit(22.0).side).isWithin(1e-9).of(22.0)
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

    @Test
    fun `the embedded catalog carries the cultural families (#13962-#13970), each installed by default, three to four frames with both films`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())
        val families = catalog.ringPacks.filter { it.slug.startsWith("cadres-") && it.slug != "cadres-illustres" }

        assertThat(families.map { it.slug }).containsExactlyElementsIn(CULTURAL_FAMILIES).inOrder()
        families.forEach { pack ->
            assertThat(pack.installedByDefault).isTrue()
            assertThat(pack.rings.size in 3..4).isTrue()
            pack.rings.forEach { ring ->
                assertThat(ring.decor?.reach).isEqualTo(1.4)
                assertThat(ring.decor?.back).isNotNull()
                assertThat(ring.decor?.front).isNotNull()
            }
        }
    }

    private companion object {
        val CULTURAL_FAMILIES = listOf("cadres-asiatiques", "cadres-africains", "cadres-celtes", "cadres-nordiques", "cadres-egyptiens", "cadres-mayas", "cadres-indiens", "cadres-amerindiens", "cadres-australs")
    }
}
