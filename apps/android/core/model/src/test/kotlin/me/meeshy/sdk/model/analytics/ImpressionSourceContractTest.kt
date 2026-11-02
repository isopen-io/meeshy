package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Une source d'impression Android est TOUJOURS une valeur que la passerelle accepte : le rail des
 * stories envoyait `story-rail`, absent de `IMPRESSION_SOURCES`, et chaque lot revenait en 400
 * (#12483). La liste se lit dans le fichier de la passerelle, jamais recopiée à la main.
 */
class ImpressionSourceContractTest {

    @Test
    fun `les sources Kotlin sont exactement IMPRESSION_SOURCES de la passerelle`() {
        assertThat(ImpressionSource.entries.map { it.wire })
            .containsExactlyElementsIn(gatewaySources()).inOrder()
    }

    @Test
    fun `le rail des stories compte sous la source story, comme iOS`() {
        assertThat(ImpressionSource.STORY.wire).isEqualTo("story")
        assertThat(gatewaySources()).doesNotContain("story-rail")
    }

    private fun gatewaySources(): List<String> {
        val text = gatewayFile().readText()
        val body = Regex("""export const IMPRESSION_SOURCES = \[(.*?)] as const""", RegexOption.DOT_MATCHES_ALL)
            .find(text)?.groupValues?.get(1)
            ?: error("IMPRESSION_SOURCES introuvable dans eventsSchemas.ts")
        return Regex("""'([a-z_]+)'""").findAll(body).map { it.groupValues[1] }.toList()
            .also { check(it.isNotEmpty()) { "IMPRESSION_SOURCES vide — la garde est aveugle" } }
    }

    private fun gatewayFile(): File {
        val path = "services/gateway/src/routes/social/eventsSchemas.ts"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("schéma de la passerelle introuvable en remontant depuis ${File("").absolutePath}: $path")
    }
}
