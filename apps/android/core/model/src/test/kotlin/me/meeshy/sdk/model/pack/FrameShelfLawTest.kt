package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FrameMomentFamily
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.FrameUsageLaw
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import org.junit.Test

class FrameShelfLawTest {

    private fun ref(content: String, ext: String = "webp") = PackAssetRef.forContent(content.toByteArray(), ext)!!

    private fun frame(id: String, usage: FrameUsage, nameKey: String = "frame.$id", thumb: PackAssetRef = ref(id)) =
        GloryFramePackFrame(id = id, usage = usage, thumb = thumb, nameKey = nameKey)

    private val names: (String, String) -> String = { parameter, value -> "$parameter:$value" }

    @Test
    fun `un cadre porte le nom traduit de sa cle et le libelle de son usage`() {
        val contract = GloryFramePackContract(listOf(frame("rang.iv", FrameUsage.Rank(GloryRank.Ambassadeur, 4))))

        val tiles = FrameShelfLaw.tiles(contract, mapOf("frame.rang.iv" to "Couronne d'ambassadeur")) {
            FrameUsageText.text(FrameUsageLaw.describeFrameUsage(it), names) { key -> "$key|%1\$s|%2\$s" }
        }

        assertThat(tiles.single().name).isEqualTo("Couronne d'ambassadeur")
        assertThat(tiles.single().usageText).isEqualTo("frame.usage.rankDivisionOnly|rank:ambassadeur|IV")
    }

    @Test
    fun `un nom sans traduction se lit par l'identifiant du cadre`() {
        val contract = GloryFramePackContract(listOf(frame("flamme.7", FrameUsage.Prestige)))

        assertThat(FrameShelfLaw.tiles(contract, emptyMap()) { "u" }.single().name).isEqualTo("flamme.7")
    }

    @Test
    fun `les cadres gardent l'ordre du contrat`() {
        val contract = GloryFramePackContract(listOf(frame("b", FrameUsage.Prestige), frame("a", FrameUsage.Prestige)))

        assertThat(FrameShelfLaw.tiles(contract, emptyMap()) { "u" }.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `le libelle d'usage place les parametres dans l'ordre rang division rarete famille`() {
        val rank = FrameUsageText.text(FrameUsageLaw.describeFrameUsage(FrameUsage.Rank(GloryRank.Voix, 2)), names) { "$it|%1\$s|%2\$s" }
        val rarity = FrameUsageText.text(FrameUsageLaw.describeFrameUsage(FrameUsage.Achievement(GloryLaws.AchievementRarity.Epic)), names) { "$it|%1\$s" }
        val family = FrameUsageText.text(FrameUsageLaw.describeFrameUsage(FrameUsage.Moment(FrameMomentFamily.Flame)), names) { "$it|%1\$s" }

        assertThat(rank).isEqualTo("frame.usage.rankDivisionOnly|rank:voix|II")
        assertThat(rarity).isEqualTo("frame.usage.achievementRarityOnly|rarity:epic")
        assertThat(family).isEqualTo("frame.usage.momentOnly|family:flame")
    }

    @Test
    fun `un usage sans parametre rend le format tel quel`() {
        val text = FrameUsageText.text(FrameUsageLaw.describeFrameUsage(FrameUsage.Prestige), names) { "Prestige uniquement" }

        assertThat(text).isEqualTo("Prestige uniquement")
    }

    @Test
    fun `le manifeste range les fichiers communs et la vignette de chaque cadre`() {
        val contractRef = ref("{}", "json")
        val stringsRef = ref("{\"a\":\"b\"}", "json")
        val cover = ref("cover")
        val preview = ref("preview")
        val detail = FramePack(
            slug = "afrique",
            name = "Afrique",
            coverUrl = "/api/v1/pack-assets/${cover.src}",
            preview = preview,
            contract = contractRef,
        )
        val thumb = ref("thumb")
        val contract = GloryFramePackContract(listOf(frame("rang.iv", FrameUsage.Prestige, thumb = thumb)))

        val manifest = FrameShelfLaw.manifest(detail, contract, stringsRef)

        assertThat(manifest.slug).isEqualTo("afrique")
        assertThat(manifest.files).containsExactly(contractRef.src, stringsRef.src, cover.src, preview.src)
        assertThat(manifest.frames).containsExactly("rang.iv", setOf(thumb.src))
    }

    @Test
    fun `le manifeste sans chaines ni couverture ne range que ce qui existe`() {
        val contractRef = ref("{}", "json")
        val detail = FramePack(slug = "p", name = "P", contract = contractRef)

        val manifest = FrameShelfLaw.manifest(detail, GloryFramePackContract(emptyList()), null)

        assertThat(manifest.files).containsExactly(contractRef.src)
    }

    @Test
    fun `un contrat d'une version que ce client ne lit pas demande la mise a jour`() {
        assertThat(FrameShelfLaw.readsSchema(null)).isTrue()
        assertThat(FrameShelfLaw.readsSchema(GloryFramePackContract.SCHEMA)).isTrue()
        assertThat(FrameShelfLaw.readsSchema(GloryFramePackContract.SCHEMA + 1)).isFalse()
    }
}
