package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import org.junit.Test

class InstalledPackListTest {

    @Serializable
    private class Envelope(val data: InstalledPackList? = null)

    private fun read(listJson: String): List<InstalledPackSummary> =
        AppearanceFixtures.json.decodeFromString(Envelope.serializer(), """{"data":$listJson}""").data!!.packs

    @Test
    fun `an installed pack that cannot be read falls alone and the list stays`() {
        val packs = read(
            """[{"slug":"essentiels","installed":true},{"slug":42},"pas un pack",{"installed":true},{"slug":"heritages","installed":true,"price":120}]""",
        )

        assertThat(packs.map { it.slug }).containsExactly("essentiels", "heritages").inOrder()
    }

    @Test
    fun `an old gateway serving neither price nor owned lists free and owned packs`() {
        val pack = read("""[{"slug":"essentiels","installed":true}]""").single()

        assertThat(pack.isPaid).isFalse()
        assertThat(pack.isOwned).isTrue()
        assertThat(pack.removable).isTrue()
    }

    @Test
    fun `a paid pack is owned only when the server says so`() {
        val packs = read(
            """[{"slug":"a","installed":true,"price":50},{"slug":"b","installed":true,"price":50,"owned":true}]""",
        )

        assertThat(packs.map { it.isOwned }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `a zero or negative price reads free`() {
        val packs = read("""[{"slug":"a","price":0},{"slug":"b","price":-5}]""")

        assertThat(packs.map { it.isPaid }).containsExactly(false, false)
        assertThat(packs.map { it.isOwned }).containsExactly(true, true)
    }

    @Test
    fun `unknown fields on an installed pack are tolerated`() {
        val packs = read("""[{"slug":"a","installed":true,"cover":"x","names":{"fr":{"name":"A"}},"usage":{"kind":"free"}}]""")

        assertThat(packs.single().slug).isEqualTo("a")
    }

    @Test
    fun `a list that is not a list reads empty`() {
        assertThat(read("""{"slug":"a"}""")).isEmpty()
    }
}
