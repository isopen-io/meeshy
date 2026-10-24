package me.meeshy.ui.icons

import androidx.compose.ui.graphics.vector.ImageVector
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal data class SymbolRow(
    val symbol: String,
    val status: String,
    val role: String?,
    val aliases: List<String>,
    val reason: String,
) {
    val cited: Set<String> get() = (listOfNotNull(role) + aliases).toSet()
}

internal data class RoleInfo(val origin: String, val directional: Boolean)

internal data class IconTable(val symbols: List<SymbolRow>, val roles: Map<String, RoleInfo>)

internal object IconsTestSupport {
    val androidRoot: File by lazy {
        generateSequence(File(System.getProperty("user.dir")).absoluteFile) { it.parentFile }
            .first { File(it, "settings.gradle.kts").isFile }
    }

    fun candidates(): List<String> =
        File(androidRoot, "i18n/icons/sf-symbols-candidates.txt").readLines().filter { it.isNotBlank() }

    fun table(): IconTable {
        val root = Json.parseToJsonElement(File(androidRoot, "i18n/icons/sf-symbols-map.json").readText()).jsonObject
        val symbols = root.getValue("symbols").jsonArray.map { it.jsonObject.toRow() }
        val roles = root.getValue("roles").jsonObject.mapValues { (_, value) ->
            val info = value.jsonObject
            RoleInfo(info.getValue("origin").jsonPrimitive.content, info.getValue("directional").jsonPrimitive.boolean)
        }
        return IconTable(symbols, roles)
    }

    private fun JsonObject.toRow() = SymbolRow(
        symbol = getValue("symbol").jsonPrimitive.content,
        status = getValue("status").jsonPrimitive.content,
        role = this["role"]?.jsonPrimitive?.content,
        aliases = (this["aliases"] as? JsonArray).orEmpty().map { it.jsonPrimitive.content },
        reason = getValue("reason").jsonPrimitive.content,
    )

    fun properties(target: Any): Map<String, ImageVector> =
        target.javaClass.declaredMethods
            .filter { it.name.startsWith("get") && it.parameterCount == 0 && it.returnType == ImageVector::class.java }
            .associate { it.name.removePrefix("get") to (it.invoke(target) as ImageVector) }
}
