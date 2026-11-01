package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.MentionCandidate
import org.junit.Test

/**
 * Qui peut-on mentionner (#14066, #14071) : la table de la passerelle (`mentionableScope`, TS) rejouée par Android sur le
 * MÊME fichier que TypeScript et Swift, `packages/shared/fixtures/mentionable-scope.vectors.json`. Toute dérive du miroir
 * Kotlin (une casse normalisée, un type de plus) rougit ici.
 */
class MentionableScopeVectorsTest {

    private fun fixture(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/mentionable-scope.vectors.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fixture partagée introuvable : packages/shared/fixtures/mentionable-scope.vectors.json")
    }

    private val root: JsonObject = Json.parseToJsonElement(fixture()).jsonObject

    private fun JsonObject.stringOrNull(key: String): String? =
        getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    private fun wire(scope: MentionableScope?): String? = when (scope) {
        MentionableScope.INTERLOCUTOR -> "interlocutor"
        MentionableScope.MEMBERS -> "members"
        MentionableScope.DIRECTORY -> "directory"
        null -> null
    }

    @Test
    fun `every raw type gets the same scope as the TypeScript law`() {
        val vectors = root.getValue("scopes").jsonArray.map { it.jsonObject }
        assertThat(vectors.size).isAtLeast(11)
        vectors.forEach { vector ->
            assertWithMessage(vector.stringOrNull("_label"))
                .that(wire(MentionableScope.of(vector.stringOrNull("input"))))
                .isEqualTo(vector.stringOrNull("expected"))
        }
    }

    @Test
    fun `every reader admits exactly what the gateway would keep`() {
        root.getValue("admits").jsonArray.map { it.jsonObject }.forEach { vector ->
            val candidateId = vector.getValue("candidateId").jsonPrimitive.content
            val context = MentionContext.conversation(
                id = "c1",
                conversationType = vector.stringOrNull("type"),
                isMember = vector.getValue("isMember").jsonPrimitive.boolean,
            )
            val roster = vector.getValue("memberIds").jsonArray.map { MentionCandidate(id = it.jsonPrimitive.content, username = it.jsonPrimitive.content) }
            val contacts = listOf(MentionCandidate(id = candidateId, username = candidateId))
            val offered = MentionLookupLaw.localMatches(
                contacts = contacts,
                context = roster,
                query = "",
                selfId = vector.stringOrNull("selfId"),
                scope = context?.scope,
            ).any { it.id == candidateId }
            assertWithMessage(vector.stringOrNull("_label"))
                .that(offered)
                .isEqualTo(vector.getValue("expected").jsonPrimitive.boolean)
        }
    }
}
