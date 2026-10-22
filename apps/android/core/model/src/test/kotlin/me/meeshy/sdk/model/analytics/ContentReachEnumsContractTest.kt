package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class ContentReachEnumsContractTest {

    @Test
    fun `les surfaces Kotlin sont exactement CONTENT_SURFACES du contrat TS`() {
        assertThat(ContentSurface.entries.map { it.wire })
            .containsExactlyElementsIn(tsList("content-surfaces.ts", "CONTENT_SURFACES")).inOrder()
        assertThat(ContentSurface.entries).hasSize(19)
    }

    @Test
    fun `les origines Kotlin sont exactement OPEN_ORIGINS du contrat TS`() {
        assertThat(OpenOrigin.entries.map { it.wire })
            .containsExactlyElementsIn(tsList("content-reach.ts", "OPEN_ORIGINS")).inOrder()
        assertThat(OpenOrigin.entries).hasSize(16)
    }

    @Test
    fun `les provenances Kotlin sont exactement VIEW_PROVENANCES du contrat TS`() {
        assertThat(ViewProvenance.entries.map { it.wire })
            .containsExactlyElementsIn(tsList("content-reach.ts", "VIEW_PROVENANCES")).inOrder()
        assertThat(ViewProvenance.entries).hasSize(6)
    }

    @Test
    fun `une valeur inconnue se decode en absente`() {
        assertThat(ContentSurface.fromWire("hologram")).isNull()
        assertThat(OpenOrigin.fromWire("hologram")).isNull()
        assertThat(ViewProvenance.fromWire("hologram")).isNull()
        assertThat(ContentSurface.fromWire(null)).isNull()
        assertThat(ContentSurface.fromWire("story_rail")).isEqualTo(ContentSurface.STORY_RAIL)
    }

    private fun tsList(fileName: String, constant: String): List<String> {
        val text = tsFile(fileName).readText()
        val body = Regex("""export const $constant = \[(.*?)] as const""", RegexOption.DOT_MATCHES_ALL)
            .find(text)?.groupValues?.get(1)
            ?: error("$constant introuvable dans $fileName")
        return Regex("""'([a-z_]+)'""").findAll(body).map { it.groupValues[1] }.toList()
            .also { check(it.isNotEmpty()) { "$constant vide dans $fileName" } }
    }

    private fun tsFile(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/types/$name")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("contrat TS introuvable en remontant depuis ${File("").absolutePath}: packages/shared/types/$name")
    }
}
