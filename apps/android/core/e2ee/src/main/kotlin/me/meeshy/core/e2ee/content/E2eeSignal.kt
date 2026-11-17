package me.meeshy.core.e2ee.content

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Un SIGNAL chiffré d'une conversation e2ee (#13142), version 1 : réaction, frappe, accusé, progression de lecture,
 * modification, suppression pour tous, vue unique ouverte, épinglage. Miroir de `E2EESignal` (iOS) et de
 * `E2EESignalV1` (`packages/shared/types/e2ee-content.ts`) : version sous la clé `s` (jamais `v`), conversation REQUISE,
 * auteur posé par le scelleur — un signal sans auteur n'est celui de personne.
 */
public data class E2eeSignal(
    val conversationId: String,
    val sentAt: Long,
    val authorUserId: String?,
    val authorDeviceId: Long?,
    val action: E2eeSignalAction,
) {
    /** JSON canonique, UTF-8 : clés triées, aucune clé absente écrite, un nombre entier sans `.0` (`"position":30`). */
    public fun encoded(): ByteArray {
        val header = listOfNotNull(
            "s" to JsonPrimitive(E2eePlaintextReader.SIGNAL_VERSION),
            "conversationId" to JsonPrimitive(conversationId),
            "sentAt" to JsonPrimitive(sentAt),
            "kind" to JsonPrimitive(action.kind),
            authorUserId?.let { "authorUserId" to JsonPrimitive(it) },
            authorDeviceId?.let { "authorDeviceId" to JsonPrimitive(it) },
        )
        val entries: List<Pair<String, JsonElement>> = header + action.fields()
        val sorted = JsonObject(entries.toMap().toSortedMap())
        return canonicalJson.encodeToString(JsonElement.serializer(), sorted).toByteArray(Charsets.UTF_8)
    }
}

/** L'accusé d'un `receipt`. */
public enum class E2eeReceipt(public val wire: String) {
    DELIVERED("delivered"),
    READ("read"),
}

/** Ce qu'un signal demande. [Unknown] : une action d'une version ultérieure, reconnue comme signal, jamais appliquée. */
public sealed interface E2eeSignalAction {
    public val kind: String

    public data class Reaction(val target: String, val emoji: String, val removed: Boolean) : E2eeSignalAction {
        override val kind: String get() = "reaction"
    }

    public data class Typing(val active: Boolean) : E2eeSignalAction {
        override val kind: String get() = "typing"
    }

    public data class Receipt(val receipt: E2eeReceipt, val targets: List<String>) : E2eeSignalAction {
        override val kind: String get() = "receipt"
    }

    public data class ReadProgress(val target: String, val attachmentId: String?, val position: Double, val completed: Boolean) : E2eeSignalAction {
        override val kind: String get() = "read-progress"
    }

    public data class Edit(val target: String, val text: String, val language: String?) : E2eeSignalAction {
        override val kind: String get() = "edit"
    }

    public data class DeleteForEveryone(val target: String) : E2eeSignalAction {
        override val kind: String get() = "delete-for-everyone"
    }

    public data class ViewOnceOpened(val target: String) : E2eeSignalAction {
        override val kind: String get() = "view-once-opened"
    }

    public data class Pin(val target: String, val pinned: Boolean) : E2eeSignalAction {
        override val kind: String get() = "pin"
    }

    public data class Unknown(override val kind: String) : E2eeSignalAction

    public companion object {
        /** Les champs de l'action [kind], lus sans coercition ; une action inconnue ne lit rien de plus que l'en-tête. */
        internal fun read(kind: String, fields: Fields): E2eeSignalAction = when (kind) {
            "reaction" -> Reaction(fields.string("target"), fields.string("emoji"), fields.boolean("removed"))
            "typing" -> Typing(fields.boolean("active"))
            "receipt" -> Receipt(receipt(fields.string("receipt")), fields.strings("targets"))
            "read-progress" -> ReadProgress(fields.string("target"), fields.optionalString("attachmentId"), fields.number("position"), fields.boolean("completed"))
            "edit" -> Edit(fields.string("target"), fields.string("text"), fields.optionalString("language"))
            "delete-for-everyone" -> DeleteForEveryone(fields.string("target"))
            "view-once-opened" -> ViewOnceOpened(fields.string("target"))
            "pin" -> Pin(fields.string("target"), fields.boolean("pinned"))
            else -> Unknown(kind)
        }

        private fun receipt(wire: String): E2eeReceipt = E2eeReceipt.entries.firstOrNull { it.wire == wire } ?: throw InvalidField()
    }
}

private fun E2eeSignalAction.fields(): List<Pair<String, JsonElement>> = when (this) {
    is E2eeSignalAction.Reaction -> listOf("target" to JsonPrimitive(target), "emoji" to JsonPrimitive(emoji), "removed" to JsonPrimitive(removed))
    is E2eeSignalAction.Typing -> listOf("active" to JsonPrimitive(active))
    is E2eeSignalAction.Receipt -> listOf("receipt" to JsonPrimitive(receipt.wire), "targets" to JsonArray(targets.map { JsonPrimitive(it) }))
    is E2eeSignalAction.ReadProgress -> listOfNotNull(
        "target" to JsonPrimitive(target),
        attachmentId?.let { "attachmentId" to JsonPrimitive(it) },
        "position" to integralOrDecimal(position),
        "completed" to JsonPrimitive(completed),
    )
    is E2eeSignalAction.Edit -> listOfNotNull("target" to JsonPrimitive(target), "text" to JsonPrimitive(text), language?.let { "language" to JsonPrimitive(it) })
    is E2eeSignalAction.DeleteForEveryone -> listOf("target" to JsonPrimitive(target))
    is E2eeSignalAction.ViewOnceOpened -> listOf("target" to JsonPrimitive(target))
    is E2eeSignalAction.Pin -> listOf("target" to JsonPrimitive(target), "pinned" to JsonPrimitive(pinned))
    is E2eeSignalAction.Unknown -> emptyList()
}

/** `JSONEncoder` écrit un `Double` entier sans `.0` (`30`), là où `Double.toString` écrirait `30.0`. */
private fun integralOrDecimal(value: Double): JsonPrimitive =
    if (value % 1.0 == 0.0 && kotlin.math.abs(value) < MAX_EXACT_DOUBLE) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

private const val MAX_EXACT_DOUBLE: Double = 9_007_199_254_740_992.0
