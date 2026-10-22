package me.meeshy.sdk.model.timeline

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import java.util.UUID

private fun newId(): String = UUID.randomUUID().toString()

private fun now(): Long = System.currentTimeMillis()

// region Transitions

@Serializable
@SerialName("addTransition")
data class AddTransitionCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val transition: StoryClipTransition,
) : EditCommand {
    override fun apply(project: TimelineProject) = project.copy(clipTransitions = project.clipTransitions + transition)

    override fun revert(project: TimelineProject) =
        project.copy(clipTransitions = project.clipTransitions.filterNot { it.id == transition.id })
}

@Serializable
@SerialName("removeTransition")
data class RemoveTransitionCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val transitionId: String,
    val snapshot: StoryClipTransition,
    val insertionIndex: Int,
) : EditCommand {
    override fun apply(project: TimelineProject): TimelineProject {
        if (project.clipTransitions.none { it.id == transitionId }) throw EditCommandError.TransitionNotFound(transitionId)
        return project.copy(clipTransitions = project.clipTransitions.filterNot { it.id == transitionId })
    }

    override fun revert(project: TimelineProject) =
        project.copy(clipTransitions = project.clipTransitions.insertedAt(insertionIndex, snapshot))
}

@Serializable
@SerialName("changeTransition")
data class ChangeTransitionCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val transitionId: String,
    val previous: StoryClipTransition,
    val updated: StoryClipTransition,
) : EditCommand {
    override fun apply(project: TimelineProject) = replacing(project, updated)

    override fun revert(project: TimelineProject) = replacing(project, previous)

    private fun replacing(project: TimelineProject, value: StoryClipTransition): TimelineProject {
        val index = project.clipTransitions.indexOfFirst { it.id == transitionId }
        if (index < 0) throw EditCommandError.TransitionNotFound(transitionId)
        return project.copy(clipTransitions = project.clipTransitions.toMutableList().also { it[index] = value })
    }
}

// endregion

// region Keyframes

/**
 * Applique [block] aux keyframes d'un clip. « Aucun keyframe » reste `null` (jamais `[]`) pour que
 * apply puis revert rende un projet égal à l'état d'avant, même quand le clip n'en avait pas.
 */
private fun TimelineProject.mutateKeyframes(
    clipId: String,
    kind: TimelineClipKind,
    block: (List<StoryKeyframe>) -> List<StoryKeyframe>,
): TimelineProject {
    fun normalized(list: List<StoryKeyframe>?): List<StoryKeyframe>? = block(list.orEmpty()).ifEmpty { null }
    return when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> updateMedia(clipId) { it.copy(keyframes = normalized(it.keyframes)) }
        TimelineClipKind.TEXT -> updateText(clipId) { it.copy(keyframes = normalized(it.keyframes)) }
        TimelineClipKind.AUDIO -> updateAudio(clipId) { it.copy(keyframes = normalized(it.keyframes)) }
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState("sticker clips do not support keyframes")
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState("place clips do not support keyframes")
    }
}

@Serializable
@SerialName("addKeyframe")
data class AddKeyframeCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val keyframe: StoryKeyframe,
) : EditCommand {
    override fun apply(project: TimelineProject) = project.mutateKeyframes(clipId, kind) { it + keyframe }

    override fun revert(project: TimelineProject) =
        project.mutateKeyframes(clipId, kind) { list -> list.filterNot { it.id == keyframe.id } }
}

/**
 * Déplace un keyframe dans le temps, et porte aussi les éditions de l'inspecteur (position, échelle,
 * opacité, easing). Un axe n'est touché que si ses DEUX côtés (old/new) sont présents.
 */
@Serializable
@SerialName("moveKeyframe")
data class MoveKeyframeCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val keyframeId: String,
    val oldTime: Float,
    val newTime: Float,
    val oldX: Double? = null,
    val newX: Double? = null,
    val oldY: Double? = null,
    val newY: Double? = null,
    val oldScale: Double? = null,
    val newScale: Double? = null,
    val oldOpacity: Double? = null,
    val newOpacity: Double? = null,
    val oldEasing: StoryEasing? = null,
    val newEasing: StoryEasing? = null,
) : EditCommand {

    override fun apply(project: TimelineProject) = mutate(project, forward = true)

    override fun revert(project: TimelineProject) = mutate(project, forward = false)

    private fun mutate(project: TimelineProject, forward: Boolean): TimelineProject =
        project.mutateKeyframes(clipId, kind) { list ->
            val index = list.indexOfFirst { it.id == keyframeId }
            if (index < 0) throw EditCommandError.KeyframeNotFound(keyframeId)
            fun <T> pick(old: T?, new: T?, current: T?): T? =
                if (old != null && new != null) (if (forward) new else old) else current
            val current = list[index]
            val updated = current.copy(
                time = if (forward) newTime else oldTime,
                x = pick(oldX, newX, current.x),
                y = pick(oldY, newY, current.y),
                scale = pick(oldScale, newScale, current.scale),
                opacity = pick(oldOpacity, newOpacity, current.opacity),
                easing = pick(oldEasing, newEasing, current.easing),
            )
            list.toMutableList().also { it[index] = updated }
        }
}

@Serializable
@SerialName("deleteKeyframe")
data class DeleteKeyframeCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val keyframeId: String,
    val snapshot: StoryKeyframe,
    val insertionIndex: Int,
) : EditCommand {
    override fun apply(project: TimelineProject) = project.mutateKeyframes(clipId, kind) { list ->
        if (list.none { it.id == keyframeId }) throw EditCommandError.KeyframeNotFound(keyframeId)
        list.filterNot { it.id == keyframeId }
    }

    override fun revert(project: TimelineProject) =
        project.mutateKeyframes(clipId, kind) { it.insertedAt(insertionIndex, snapshot) }
}

// endregion
