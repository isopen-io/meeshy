package me.meeshy.sdk.model.timeline

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs

/** Une étape d'annulation ou de rétablissement : la nouvelle pile et la commande à (dé)jouer. */
data class StackStep(val stack: CommandStack, val command: EditCommand)

/**
 * Pile Annuler/Rétablir linéaire et IMMUABLE (miroir de `CommandStack.swift`), plafonnée FIFO
 * ([maxSize]) et à coalescence temporelle ([coalesceWindowMillis]).
 *
 * Invariant du curseur : `commands[0 until cursor]` sont appliquées, `commands[cursor until size]`
 * rétablissables. Une commande poussée après un Annuler vide la branche Rétablir.
 */
class CommandStack private constructor(
    val commands: List<EditCommand>,
    val cursor: Int,
    val maxSize: Int,
    val coalesceWindowMillis: Long,
) {
    constructor(maxSize: Int = DEFAULT_MAX_SIZE, coalesceWindowMillis: Long = DEFAULT_COALESCE_MILLIS) :
        this(emptyList(), 0, maxOf(1, maxSize), coalesceWindowMillis)

    val canUndo: Boolean get() = cursor > 0
    val canRedo: Boolean get() = cursor < commands.size
    val size: Int get() = commands.size

    fun push(command: EditCommand): CommandStack {
        val applied = commands.take(cursor)
        val merged = applied.lastOrNull()?.let { coalesce(it, command, coalesceWindowMillis) }
        val next = if (merged != null) {
            applied.dropLast(1) + merged
        } else {
            (applied + command).takeLast(maxSize)
        }
        return CommandStack(next, next.size, maxSize, coalesceWindowMillis)
    }

    /** `null` quand il n'y a rien à annuler. La commande reste sur la pile pour le rétablissement. */
    fun undo(): StackStep? {
        if (!canUndo) return null
        val moved = CommandStack(commands, cursor - 1, maxSize, coalesceWindowMillis)
        return StackStep(moved, commands[cursor - 1])
    }

    /** `null` quand il n'y a rien à rétablir. */
    fun redo(): StackStep? {
        if (!canRedo) return null
        val moved = CommandStack(commands, cursor + 1, maxSize, coalesceWindowMillis)
        return StackStep(moved, commands[cursor])
    }

    fun snapshot(): CommandStackSnapshot = CommandStackSnapshot(commands, cursor)

    /** Curseur ramené dans `[0, size]` pour tolérer un instantané corrompu. */
    fun restoring(snapshot: CommandStackSnapshot): CommandStack =
        CommandStack(snapshot.commands, snapshot.cursor.coerceIn(0, snapshot.commands.size), maxSize, coalesceWindowMillis)

    companion object {
        const val DEFAULT_MAX_SIZE = 50
        const val DEFAULT_COALESCE_MILLIS = 500L

        /**
         * Fusionne deux commandes de glissement sur la même cible dans la fenêtre : la valeur d'avant
         * du premier geste et la valeur courante du dernier, pour qu'un seul Annuler revienne à
         * l'état d'avant le geste (sinon un drag à 60 ips saturerait le plafond en une seconde).
         */
        private fun coalesce(previous: EditCommand, next: EditCommand, windowMillis: Long): EditCommand? {
            if (abs(next.timestamp - previous.timestamp) > windowMillis) return null
            return when {
                previous is MoveClipCommand && next is MoveClipCommand &&
                    previous.clipId == next.clipId && previous.kind == next.kind ->
                    next.copy(oldStartTime = previous.oldStartTime)
                previous is TrimClipCommand && next is TrimClipCommand &&
                    previous.clipId == next.clipId && previous.kind == next.kind ->
                    next.copy(oldStartTime = previous.oldStartTime, oldDuration = previous.oldDuration)
                previous is MoveKeyframeCommand && next is MoveKeyframeCommand &&
                    previous.clipId == next.clipId && previous.kind == next.kind &&
                    previous.keyframeId == next.keyframeId -> next.copy(
                    oldTime = previous.oldTime,
                    oldX = previous.oldX ?: next.oldX, newX = next.newX ?: previous.newX,
                    oldY = previous.oldY ?: next.oldY, newY = next.newY ?: previous.newY,
                    oldScale = previous.oldScale ?: next.oldScale, newScale = next.newScale ?: previous.newScale,
                    oldOpacity = previous.oldOpacity ?: next.oldOpacity, newOpacity = next.newOpacity ?: previous.newOpacity,
                    oldEasing = previous.oldEasing ?: next.oldEasing, newEasing = next.newEasing ?: previous.newEasing,
                )
                else -> null
            }
        }
    }
}

/**
 * Instantané persistable d'une [CommandStack], écrit à côté du brouillon pour que l'historique
 * survive à la fermeture de l'éditeur et au redémarrage du processus.
 */
data class CommandStackSnapshot(val commands: List<EditCommand>, val cursor: Int) {

    fun toJson(): String = Json.encodeToString(
        JsonElement.serializer(),
        JsonObject(
            mapOf(
                "commands" to JsonArray(commands.map(AnyEditCommandCodec::encode)),
                "cursor" to JsonPrimitive(cursor),
            ),
        ),
    )

    companion object {
        val EMPTY = CommandStackSnapshot(emptyList(), 0)

        /**
         * Décodage tolérant : une commande de type inconnu ou invalide est ignorée sans casser la pile,
         * et le curseur recule d'autant de commandes écartées qu'il en avait derrière lui. `null` si le
         * document lui-même est illisible.
         */
        fun fromJsonOrNull(text: String): CommandStackSnapshot? = runCatching {
            val root = Json.parseToJsonElement(text).jsonObject
            val rawCursor = root["cursor"]?.jsonPrimitive?.int ?: 0
            val raw = root["commands"] as? JsonArray ?: JsonArray(emptyList())
            val decoded = raw.map { AnyEditCommandCodec.decodeOrNull(it) }
            val dropsBeforeCursor = decoded.take(rawCursor.coerceIn(0, decoded.size)).count { it == null }
            val commands = decoded.filterNotNull()
            CommandStackSnapshot(commands, (rawCursor - dropsBeforeCursor).coerceIn(0, commands.size))
        }.getOrNull()
    }
}
