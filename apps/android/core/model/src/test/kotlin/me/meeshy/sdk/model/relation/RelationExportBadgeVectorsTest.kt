package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Le logo de cercle peint sur l'intro d'une story exportée est une loi PURE (`relationExportBadge`, TS) rejouée par iOS et
 * Android sur le MÊME fichier, `packages/shared/fixtures/relation-export-badge.vectors.json` (#13997). L'oracle n'est pas écrit
 * à la main : toute dérive du miroir Kotlin rougit ici.
 */
class RelationExportBadgeVectorsTest {

    private fun fixture(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/relation-export-badge.vectors.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fixture partagée introuvable : packages/shared/fixtures/relation-export-badge.vectors.json")
    }

    private val vectors: List<JsonObject> =
        Json.parseToJsonElement(fixture()).jsonObject.getValue("vectors").jsonArray.map { it.jsonObject }

    private fun JsonObject.stringOrNull(key: String): String? =
        getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    @Test
    fun `the fixture carries the full ladder`() {
        assertThat(vectors.size).isAtLeast(11)
    }

    @Test
    fun `every shared vector gets the same badge as the TypeScript law`() {
        vectors.forEach { vector ->
            assertWithMessage(vector.stringOrNull("_label"))
                .that(RelationExportBadge.of(vector.stringOrNull("input")))
                .isEqualTo(vector.stringOrNull("expected"))
        }
    }

    @Test
    fun `friend and below paint nothing while close and blood paint their circle`() {
        assertThat(RelationExportBadge.of("FRIEND")).isNull()
        assertThat(RelationExportBadge.of("CLOSE")).isEqualTo("🔥")
        assertThat(RelationExportBadge.of("BLOOD")).isEqualTo("🩸")
    }
}
