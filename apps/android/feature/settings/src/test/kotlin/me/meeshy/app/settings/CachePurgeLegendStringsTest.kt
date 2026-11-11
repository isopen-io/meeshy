package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CachePurgeLimitation
import org.junit.Test

class CachePurgeLegendStringsTest {

    private val locales = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private fun names(folder: String): Set<String> =
        File("src/main/res/$folder").listFiles { f -> f.name.startsWith("strings") }.orEmpty()
            .flatMap { Regex("""<string name="([^"]+)"""").findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
            .toSet()

    private val legend = listOf(
        "purge_limitation_no_store", "purge_limitation_embedded",
        "purge_limitation_indivisible", "purge_limitation_not_applicable",
    )

    @Test
    fun `every structural limitation has a legend line in the seven locales`() {
        assertThat(CachePurgeLimitation.entries).hasSize(legend.size)
        locales.forEach { folder ->
            assertWithMessage("légende absente de $folder").that(names(folder)).containsAtLeastElementsIn(legend)
        }
    }

    @Test
    fun `kinds domains and the purge actions are labelled in the seven locales`() {
        val required = CacheDataKind.entries.map { "purge_kind_${it.name.lowercase()}" } +
            CacheDomain.entries.map { "purge_domain_${it.name.lowercase()}" } +
            listOf(
                "purge_action_empty", "purge_action_with_size", "purge_action_hint", "purge_confirm_title",
                "purge_confirm_message", "purge_confirm_action", "purge_select_all", "purge_unattributed_label",
                "purge_unattributed_note", "cache_purge_freed", "data_storage_title",
            )
        locales.forEach { folder ->
            assertWithMessage("libellés absents de $folder").that(names(folder)).containsAtLeastElementsIn(required)
        }
    }
}
