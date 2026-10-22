package me.meeshy.sdk.model.timeline

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Les 13 commandes concrètes persistées dans une seule liste homogène (miroir de `AnyEditCommand`). */
typealias AnyEditCommand = EditCommand

/**
 * Codec de la pile : chaque commande est `{"type": "<tag>", ...champs}`. Le décodage est TOLÉRANT :
 * un type inconnu (pile écrite par une version plus récente) ou un payload invalide rend `null` au
 * lieu de casser toute la pile.
 */
object AnyEditCommandCodec {

    private val json = Json {
        classDiscriminator = "type"
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    fun encode(command: EditCommand): JsonElement = json.encodeToJsonElement(EditCommand.serializer(), command)

    fun decodeOrNull(element: JsonElement): EditCommand? =
        runCatching { json.decodeFromJsonElement(EditCommand.serializer(), element) }.getOrNull()

    /** Étiquette de fil d'une commande (`addClip`, `moveClip`...). */
    fun typeTag(command: EditCommand): String = when (command) {
        is AddClipCommand -> "addClip"
        is DeleteClipCommand -> "deleteClip"
        is MoveClipCommand -> "moveClip"
        is TrimClipCommand -> "trimClip"
        is SplitClipCommand -> "splitClip"
        is AddTransitionCommand -> "addTransition"
        is RemoveTransitionCommand -> "removeTransition"
        is ChangeTransitionCommand -> "changeTransition"
        is AddKeyframeCommand -> "addKeyframe"
        is MoveKeyframeCommand -> "moveKeyframe"
        is DeleteKeyframeCommand -> "deleteKeyframe"
        is SetClipPropertyCommand -> "setClipProperty"
        is SetSlideDurationCommand -> "setSlideDuration"
    }
}
