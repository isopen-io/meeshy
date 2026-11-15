package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * LA LOI D'UNE DEMANDE DE CRAN, côté Android (#13938) : le miroir Kotlin rejoue les cas COMMUNS
 * `packages/shared/fixtures/relation-request-cases.json` (même fichier que `RelationRequestCasesTests.swift`). Un ordre de
 * refus, un saut ou un cool-down qui dériverait de `evaluateRelationRequest` rougit ici.
 */
class RelationRequestCasesTest {

    private fun sharedText(path: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fichier partagé introuvable : $path")
    }

    private fun JsonObject.text(key: String): String? =
        this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    private val cases = Json.parseToJsonElement(sharedText("packages/shared/fixtures/relation-request-cases.json")).jsonArray

    @Test
    fun `les cas communs sont lus et non vides`() {
        assertWithMessage("cas communs").that(cases.size).isAtLeast(10)
    }

    @Test
    fun `chaque cas commun rend le verdict du serveur`() {
        cases.map { it.jsonObject }.forEach { case ->
            val id = case.getValue("id").jsonPrimitive.content
            val input = case.getValue("input").jsonObject
            val expected = case.getValue("expected").jsonObject
            val verdict = RelationRequestRule.evaluate(
                target = RelationLevel.of(input.text("targetLevel")),
                current = RelationLevel.of(input.text("currentLevel")),
                eligibleFor = input.text("eligibleFor")?.let { RelationLevel.of(it) },
                cooldownUntilMillis = input.text("cooldownUntil")?.let { Instant.parse(it).toEpochMilli() },
                nowMillis = Instant.parse(input.text("now")!!).toEpochMilli(),
            )
            val allowed = expected.getValue("allowed").jsonPrimitive.content.toBoolean()
            val served = if (allowed) {
                RelationRequestVerdict.Allowed
            } else {
                RelationRequestVerdict.Refused(RelationRequestRefusal.entries.first { it.code == expected.text("code") })
            }
            assertWithMessage(id).that(verdict).isEqualTo(served)
        }
    }

    @Test
    fun `le cran suivant ne saute jamais un niveau et n'existe plus au sommet`() {
        assertWithMessage("Public").that(RelationRequestRule.rungAfter(RelationLevel.PUBLIC)).isEqualTo(RelationLevel.ACQUAINTANCE)
        assertWithMessage("Communauté").that(RelationRequestRule.rungAfter(RelationLevel.COMMUNITY)).isEqualTo(RelationLevel.ACQUAINTANCE)
        assertWithMessage("Ami").that(RelationRequestRule.rungAfter(RelationLevel.FRIEND)).isEqualTo(RelationLevel.CLOSE)
        assertWithMessage("Sang").that(RelationRequestRule.rungAfter(RelationLevel.BLOOD)).isNull()
    }
}
