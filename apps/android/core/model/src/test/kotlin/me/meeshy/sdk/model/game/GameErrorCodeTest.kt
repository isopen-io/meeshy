package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class GameErrorCodeTest {

    @Test
    fun `les valeurs sont exactement celles de GAME_ERROR_CODES du TypeScript`() {
        assertThat(GameErrorCode.entries.map { it.wire }).containsExactlyElementsIn(sharedWireCodes())
        assertThat(GameErrorCode.entries).hasSize(31)
    }

    @Test
    fun `chaque code se relit depuis son champ code`() {
        GameErrorCode.entries.forEach { assertThat(GameErrorCode.fromWire(it.wire)).isEqualTo(it) }
    }

    @Test
    fun `un code inconnu absent ou vide rend null sans lever`() {
        assertThat(GameErrorCode.fromWire("FUTURE_CODE")).isNull()
        assertThat(GameErrorCode.fromWire("")).isNull()
        assertThat(GameErrorCode.fromWire(null)).isNull()
        assertThat(GameErrorCode.fromWire("mint_blocked_by_debt")).isNull()
    }

    @Test
    fun `l'en-tete de version et la vague sont ceux du contrat`() {
        assertThat(GameWire.versionHeader).isEqualTo("X-Meeshy-Game-Version")
        assertThat(GameWire.waveVersion).isEqualTo(2)
    }

    private fun sharedWireCodes(): List<String> {
        val relative = "packages/shared/types/game-routes.ts"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return Regex("""^\s+\w+: '([A-Z_]+)',""", RegexOption.MULTILINE)
                .findAll(candidate.readText().substringAfter("GAME_ERROR_CODES = {").substringBefore("} as const"))
                .map { it.groupValues[1] }
                .toList()
            dir = dir.parentFile
        }
        error("game-routes.ts introuvable en remontant depuis ${File("").absolutePath}")
    }
}
