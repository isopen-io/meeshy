package me.meeshy.sdk.model.timeline

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Opération atomique et réversible sur un [TimelineProject] (miroir de
 * `EditCommand`). Chaque commande porte le delta minimal pour s'appliquer et se
 * révoquer ; `apply` puis `revert` rend un projet strictement égal à l'original.
 *
 * Le fil est un objet `{"type": <tag>, ...}` : voir [AnyEditCommandCodec], qui
 * ignore sans casser la pile un type inconnu.
 */
@Serializable
sealed interface EditCommand {
    val id: String
    /** Horloge murale en millisecondes epoch ; sert à la coalescence des gestes. */
    val timestamp: Long

    /** @throws EditCommandError si l'état du projet ne correspond plus aux hypothèses de la commande. */
    fun apply(project: TimelineProject): TimelineProject

    /** @throws EditCommandError */
    fun revert(project: TimelineProject): TimelineProject
}

/** Erreurs typées d'une commande appliquée à un projet qui a changé sous elle. */
sealed class EditCommandError(message: String) : Exception(message) {
    class ClipNotFound(val clipId: String) : EditCommandError("clip not found: $clipId") {
        override fun equals(other: Any?) = other is ClipNotFound && other.clipId == clipId
        override fun hashCode() = clipId.hashCode()
    }

    class TransitionNotFound(val transitionId: String) : EditCommandError("transition not found: $transitionId") {
        override fun equals(other: Any?) = other is TransitionNotFound && other.transitionId == transitionId
        override fun hashCode() = transitionId.hashCode()
    }

    class KeyframeNotFound(val keyframeId: String) : EditCommandError("keyframe not found: $keyframeId") {
        override fun equals(other: Any?) = other is KeyframeNotFound && other.keyframeId == keyframeId
        override fun hashCode() = keyframeId.hashCode()
    }

    class InvalidState(val reason: String) : EditCommandError("invalid state: $reason") {
        override fun equals(other: Any?) = other is InvalidState && other.reason == reason
        override fun hashCode() = reason.hashCode()
    }
}

/**
 * Famille ciblée par une commande. `video` et `image` vivent tous deux dans
 * `mediaObjects`. `sticker` et `place` se déplacent et se rognent depuis la
 * timeline ; les poser, les retirer, les scinder ou les animer reste l'affaire
 * du canvas, d'où les refus `InvalidState` des commandes concernées.
 */
@Serializable
enum class TimelineClipKind {
    @SerialName("video") VIDEO,
    @SerialName("image") IMAGE,
    @SerialName("audio") AUDIO,
    @SerialName("text") TEXT,
    @SerialName("sticker") STICKER,
    @SerialName("place") PLACE,
}
