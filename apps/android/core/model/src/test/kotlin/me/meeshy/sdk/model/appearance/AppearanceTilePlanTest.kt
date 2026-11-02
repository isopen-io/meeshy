package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class AppearanceTilePlanTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    private fun patterns(): List<AppearanceDesign> = catalog.wallpaperPacks.flatMap { it.designs }.filter { it.tile != null }

    private fun pattern(): AppearanceDesign =
        Json { ignoreUnknownKeys = true }.decodeFromString(AppearanceDesign.serializer(), AppearanceFixtures.patternJson("motif").toString())

    @Test
    fun `every tile stroke of the catalog is a faint whisper between 0,06 and 0,32`() {
        val strokes = patterns().flatMap { it.tile!!.paths }
        assertThat(strokes).isNotEmpty()
        strokes.forEach {
            assertThat(it.opacity).isAtLeast(0.06)
            assertThat(it.opacity).isAtMost(0.32)
        }
    }

    @Test
    fun `tile pixel size is unit size times scale times density, at least one pixel`() {
        val tile = pattern().tile!!
        assertThat(AppearanceTilePlan.pixelSize(tile, 1.0)).isEqualTo(48 to 48)
        assertThat(AppearanceTilePlan.pixelSize(tile, 2.5)).isEqualTo(120 to 120)
        assertThat(AppearanceTilePlan.pixelSize(tile, 0.0001)).isEqualTo(1 to 1)
    }

    @Test
    fun `a rotated layer is enlarged one and a half times, an upright one is not`() {
        val tile = pattern().tile!!
        assertThat(AppearanceTilePlan.spread(tile)).isEqualTo(1.0)
        assertThat(AppearanceTilePlan.spread(tile.copy(rotation = 12.0))).isEqualTo(1.5)
    }

    @Test
    fun `the key tells design, scheme, accent and density apart`() {
        val design = pattern()
        val base = AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#6366F1", 2.0)
        assertThat(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#6366F1", 2.0)).isEqualTo(base)
        assertThat(AppearanceTilePlan.key(design, AppearanceScheme.DARK, "#6366F1", 2.0)).isNotEqualTo(base)
        assertThat(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#FF0000", 2.0)).isNotEqualTo(base)
        assertThat(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#6366F1", 3.0)).isNotEqualTo(base)
    }

    @Test
    fun `the key follows the content of a design that a pack changed under the same key`() {
        val design = pattern()
        val edited = design.copy(tile = design.tile!!.copy(scale = 2.0))
        assertThat(AppearanceTilePlan.key(edited, AppearanceScheme.LIGHT, "#6366F1", 1.0))
            .isNotEqualTo(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#6366F1", 1.0))
    }

    @Test
    fun `an invalid accent shares the indigo key`() {
        val design = pattern()
        assertThat(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "nope", 1.0))
            .isEqualTo(AppearanceTilePlan.key(design, AppearanceScheme.LIGHT, "#6366f1", 1.0))
    }

    @Test
    fun `the cache is bounded to thirty two entries and evicts the least recently used`() {
        val cache = BoundedLruCache<String, Int>(AppearanceTilePlan.CACHE_CAPACITY)
        repeat(32) { cache.getOrPut("k$it") { it } }
        cache["k0"]
        cache.getOrPut("k32") { 32 }
        assertThat(cache.size).isEqualTo(32)
        assertThat(cache["k0"]).isEqualTo(0)
        assertThat(cache["k1"]).isNull()
    }

    @Test
    fun `a tile renders once per key and a failed render is not cached`() {
        val cache = BoundedLruCache<String, Int>(4)
        var renders = 0
        repeat(3) { cache.getOrPut("a") { ++renders } }
        assertThat(renders).isEqualTo(1)
        assertThat(cache.getOrPut("b") { null }).isNull()
        assertThat(cache.size).isEqualTo(1)
    }
}
