package me.meeshy.sdk.model.composer.timeline

import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.timeline.AddClipCommand
import me.meeshy.sdk.model.timeline.ClipProperty
import me.meeshy.sdk.model.timeline.CommandStack
import me.meeshy.sdk.model.timeline.DeleteClipCommand
import me.meeshy.sdk.model.timeline.EditCommand
import me.meeshy.sdk.model.timeline.EditCommandError
import me.meeshy.sdk.model.timeline.MoveClipCommand
import me.meeshy.sdk.model.timeline.SetClipPropertyCommand
import me.meeshy.sdk.model.timeline.SetSlideDurationCommand
import me.meeshy.sdk.model.timeline.SplitClipCommand
import me.meeshy.sdk.model.timeline.TimelineClipKind
import me.meeshy.sdk.model.timeline.TimelineProject
import me.meeshy.sdk.model.timeline.TrimClipCommand
import java.util.UUID
import kotlin.math.abs

/** « La durée de la slide a changé d'elle-même » : de [from] à [to], un seul toast, jamais pendant un glissé. */
data class DurationNotice(val from: Float, val to: Float)

/**
 * L'édition de la timeline : projet, pile d'annulation, sélection, tête de lecture et durée d'auteur
 * (miroir des règles de `TimelineViewModel` + `+Plan4Helpers`). Valeur IMMUABLE : chaque geste rend la
 * nouvelle valeur, le ViewModel n'est qu'un porteur de `StateFlow`.
 *
 * Les gestes de fenêtre passent par UN seul point ([applyWindow]) où s'appliquent les bornes de
 * [ClipWindowResolver] et le plafond de durée native ; un réglage sans effet n'empile aucune entrée.
 */
data class TimelineEditor(
    val project: TimelineProject,
    val stack: CommandStack = CommandStack(),
    val selection: ClipSelectionState = ClipSelectionState(),
    /** Ce que « +10 s » a posé : un PLANCHER, un contenu plus long l'emporte. `null` : la durée dérive du contenu. */
    val authoredSlideDuration: Float? = null,
    val snapEnabled: Boolean = true,
    val playhead: Float = 0f,
    /** Reçu une fois par l'écran, puis [consumeDurationNotice]. */
    val durationNotice: DurationNotice? = null,
    /** Incrémenté à chaque ACCROCHE de l'aimant (transition non accroché -> accroché) : l'écran en tire l'haptique légère. */
    val snapPulse: Int = 0,
    val errorMessage: String? = null,
    private val durationBeforeDrag: Float? = null,
) {

    val canUndo: Boolean get() = stack.canUndo
    val canRedo: Boolean get() = stack.canRedo

    // region sélection

    /** Tap : surligne, n'ouvre jamais la fiche. */
    fun select(clipId: String?): TimelineEditor =
        copy(selection = if (clipId == null) selection.deselect() else selection.select(clipId))

    /** Double tap : surligne ET ouvre la fiche. */
    fun inspect(clipId: String): TimelineEditor = copy(selection = selection.inspect(clipId))

    fun endInspection(): TimelineEditor = copy(selection = selection.endInspection())

    fun consumeDurationNotice(): TimelineEditor = copy(durationNotice = null)

    fun consumeError(): TimelineEditor = copy(errorMessage = null)

    fun toggleSnap(): TimelineEditor = copy(snapEnabled = !snapEnabled)

    // endregion

    // region tête de lecture

    fun scrub(time: Float): TimelineEditor =
        if (!time.isFinite()) this else copy(playhead = time.coerceIn(0f, project.slideDuration))

    // endregion

    // region glissé aimanté

    fun beginDrag(clipId: String): TimelineEditor {
        if (TimelineSlideBinding.isSynthetic(clipId)) return this
        val original = project.startOf(clipId) ?: return this
        return copy(selection = selection.beginDrag(clipId, original), durationBeforeDrag = project.slideDuration)
    }

    /**
     * Un cran du glissé. [rawTime] est le début voulu avant aimantation, [geometry] l'échelle RÉELLEMENT dessinée
     * (c'est l'appelant qui sait à quelle densité il peint). Les bords de tous les AUTRES objets, les bornes de
     * la slide et la tête de lecture sont les points d'accroche ; [extraCandidates] s'y ajoute.
     */
    fun dragMoved(rawTime: Float, geometry: TimelineGeometry, extraCandidates: List<SnapCandidate> = emptyList()): TimelineEditor {
        val drag = selection.activeDrag ?: return this
        val wasSnapped = drag.snappedTo != null
        val result = SnapEngine(geometry.dragSnapToleranceSeconds)
            .snap(rawTime, extraCandidates + magneticCandidates(drag.clipId), disabled = !snapEnabled)
        val snappedKind = result.matched?.kind?.toSnappedKind()
        val moved = copy(
            selection = selection.updateDrag(result.snappedTime, snappedKind),
            snapPulse = if (snappedKind != null && !wasSnapped) snapPulse + 1 else snapPulse,
        ).withStart(drag.clipId, result.snappedTime)
        return moved.recomputeDuration(announcing = true)
    }

    /** Relâche : UNE commande de déplacement (rien si le clip est revenu à son point de départ), puis le toast de durée. */
    fun endDrag(): TimelineEditor {
        val drag = selection.activeDrag ?: return this
        val kind = project.kindOf(drag.clipId) ?: return copy(selection = selection.endDrag())
        val unchanged = abs(drag.currentStartTime - drag.originalStartTime) < EPSILON
        if (unchanged) return copy(selection = selection.endDrag(), durationBeforeDrag = null)
        val command = MoveClipCommand(
            clipId = drag.clipId,
            kind = kind,
            oldStartTime = drag.originalStartTime,
            newStartTime = drag.currentStartTime,
        )
        return copy(stack = stack.push(command), selection = selection.endDrag()).recomputeDuration(announcing = true)
    }

    /** Geste interrompu (changement de slide, fermeture) : le clip retrouve son début d'origine. */
    fun cancelDrag(): TimelineEditor {
        val drag = selection.activeDrag ?: return this
        return withStart(drag.clipId, drag.originalStartTime).copy(selection = selection.endDrag(), durationBeforeDrag = null)
    }

    private fun magneticCandidates(excluded: String): List<SnapCandidate> = buildList {
        add(SnapCandidate(SnapCandidate.Kind.SLIDE_START, 0f))
        add(SnapCandidate(SnapCandidate.Kind.SLIDE_END, project.slideDuration))
        add(SnapCandidate(SnapCandidate.Kind.PLAYHEAD, playhead))
        project.windows()
            .filter { it.id != excluded && !TimelineSlideBinding.isSynthetic(it.id) }
            .forEach {
                add(SnapCandidate(SnapCandidate.Kind.CLIP_START, it.start))
                add(SnapCandidate(SnapCandidate.Kind.CLIP_END, it.start + maxOf(0f, it.duration ?: 0f)))
            }
    }

    // endregion

    // region fenêtre : début, fin, durée, rognage

    /** Un clip permanent (durée absente) matérialise sa fenêtre effective : sans cela ses poignées restent inertes. */
    fun window(clipId: String): ClipWindowResolver.Window? {
        val start = project.startOf(clipId) ?: return null
        val duration = project.durationOf(clipId)
            ?: TimelineGeometry.effectiveClipDuration(start, null, project.slideDuration)
        return ClipWindowResolver.Window(start, duration)
    }

    fun setStart(clipId: String, seconds: Float) = applyWindow(clipId, ClipWindowResolver.Edit.Move(seconds))

    fun setEnd(clipId: String, seconds: Float) = applyWindow(clipId, ClipWindowResolver.Edit.SetEnd(seconds))

    fun setDuration(clipId: String, seconds: Float) = applyWindow(clipId, ClipWindowResolver.Edit.SetDuration(seconds))

    fun nudgeStart(clipId: String, delta: Float): TimelineEditor {
        val current = window(clipId)?.takeIf { delta.isFinite() } ?: return this
        return applyWindow(clipId, ClipWindowResolver.Edit.Move(current.start + delta))
    }

    fun trimStart(clipId: String, delta: Float): TimelineEditor {
        val current = window(clipId)?.takeIf { delta.isFinite() } ?: return this
        return applyWindow(clipId, ClipWindowResolver.Edit.SetStart(current.start + delta))
    }

    fun trimEnd(clipId: String, delta: Float): TimelineEditor {
        val current = window(clipId)?.takeIf { delta.isFinite() } ?: return this
        return applyWindow(clipId, ClipWindowResolver.Edit.SetEnd(current.end + delta))
    }

    /** Point de passage UNIQUE des bornes : résolveur, puis plafond de durée native de la source (jamais sur un déplacement). */
    fun applyWindow(clipId: String, edit: ClipWindowResolver.Edit): TimelineEditor {
        if (TimelineSlideBinding.isSynthetic(clipId)) return this
        val kind = project.kindOf(clipId) ?: return this
        val current = window(clipId) ?: return this
        var resolved = ClipWindowResolver.resolve(edit, current)
        val limit = project.nativeDurationLimit(clipId)
        if (limit != null && resolved.duration > limit) resolved = ClipWindowResolver.Window(resolved.start, limit)
        val startMoved = abs(resolved.start - current.start) > EPSILON
        val durationChanged = abs(resolved.duration - current.duration) > EPSILON
        if (!startMoved && !durationChanged) return this
        val command: EditCommand = if (durationChanged) {
            TrimClipCommand(
                clipId = clipId, kind = kind,
                oldStartTime = current.start, oldDuration = current.duration,
                newStartTime = resolved.start, newDuration = resolved.duration,
            )
        } else {
            MoveClipCommand(clipId = clipId, kind = kind, oldStartTime = current.start, newStartTime = resolved.start)
        }
        return run(command).recomputeDurationIfOk()
    }

    // endregion

    // region réglages d'un clip

    fun setVolume(clipId: String, volume: Float): TimelineEditor {
        val kind = project.kindOf(clipId)?.takeIf { it.hasVolume() } ?: return this
        val old = project.volumeOf(clipId) ?: 1f
        return run(SetClipPropertyCommand(clipId = clipId, kind = kind, property = ClipProperty.Volume(old, maxOf(0f, volume))))
    }

    /** Muet <-> niveau mémorisé : la sémantique vit dans [StoryVolumeCarryingLaw], la commande reste annulable. */
    fun toggleMute(clipId: String): TimelineEditor {
        val kind = project.kindOf(clipId)?.takeIf { it == TimelineClipKind.VIDEO || it == TimelineClipKind.AUDIO } ?: return this
        val state = project.volumeStateOf(clipId) ?: return this
        val next = me.meeshy.sdk.model.scene.StoryVolumeCarryingLaw.toggleMute(state)
        return run(SetClipPropertyCommand(clipId = clipId, kind = kind, property = ClipProperty.Volume(state.volume, next.volume)))
    }

    fun setFadeIn(clipId: String, seconds: Float): TimelineEditor {
        val kind = project.kindOf(clipId)?.takeIf { it.hasFades() } ?: return this
        return run(SetClipPropertyCommand(clipId = clipId, kind = kind, property = ClipProperty.FadeIn(project.fadeInOf(clipId), seconds.toDouble())))
    }

    fun setFadeOut(clipId: String, seconds: Float): TimelineEditor {
        val kind = project.kindOf(clipId)?.takeIf { it.hasFades() } ?: return this
        return run(SetClipPropertyCommand(clipId = clipId, kind = kind, property = ClipProperty.FadeOut(project.fadeOutOf(clipId), seconds.toDouble())))
    }

    // endregion

    // region structure : scission, suppression, durée

    /** Coupe le clip sélectionné à la tête, chaque moitié gardant au moins une milliseconde. */
    fun splitSelectedAtPlayhead(newId: () -> String = { UUID.randomUUID().toString() }): TimelineEditor {
        val id = selection.selectedClipId ?: return this
        if (TimelineSlideBinding.isSynthetic(id)) return this
        val kind = project.kindOf(id) ?: return this
        val start = project.startOf(id) ?: return this
        val duration = project.durationOf(id) ?: return this
        val relative = (playhead - start).coerceIn(MIN_SPLIT_HALF, maxOf(MIN_SPLIT_HALF, duration - MIN_SPLIT_HALF))
        val command = SplitClipCommand(
            clipId = id, kind = kind, splitAtRelativeTime = relative, leftId = newId(), rightId = newId(),
        )
        return run(command).recomputeDurationIfOk()
    }

    /** Média, son et texte seulement : sticker et lieu se retirent depuis la scène. */
    fun deleteClip(clipId: String): TimelineEditor {
        if (TimelineSlideBinding.isSynthetic(clipId)) return this
        val kind = project.kindOf(clipId) ?: return this
        val command = when (kind) {
            TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.mediaObjects.indexOfFirst { it.id == clipId }.let {
                DeleteClipCommand(clipId = clipId, kind = kind, snapshotMedia = project.mediaObjects[it], insertionIndex = it)
            }
            TimelineClipKind.AUDIO -> project.audioPlayerObjects.indexOfFirst { it.id == clipId }.let {
                DeleteClipCommand(clipId = clipId, kind = kind, snapshotAudio = project.audioPlayerObjects[it], insertionIndex = it)
            }
            TimelineClipKind.TEXT -> project.textObjects.indexOfFirst { it.id == clipId }.let {
                DeleteClipCommand(clipId = clipId, kind = kind, snapshotText = project.textObjects[it], insertionIndex = it)
            }
            TimelineClipKind.STICKER, TimelineClipKind.PLACE -> return this
        }
        val ran = run(command)
        val cleared = if (ran.selection.selectedClipId == clipId) ran.copy(selection = ran.selection.deselect()) else ran
        return cleared.recomputeDurationIfOk()
    }

    fun addMedia(clipId: String, postMediaId: String, video: Boolean, startTime: Float = 0f, duration: Float = 5f): TimelineEditor =
        run(
            AddClipCommand(
                clipId = clipId, postMediaId = postMediaId,
                kind = if (video) TimelineClipKind.VIDEO else TimelineClipKind.IMAGE,
                startTime = startTime, duration = duration,
            ),
        ).recomputeDurationIfOk()

    fun addAudio(clipId: String, postMediaId: String, startTime: Float = 0f, duration: Float = 5f): TimelineEditor =
        run(AddClipCommand(clipId = clipId, postMediaId = postMediaId, kind = TimelineClipKind.AUDIO, startTime = startTime, duration = duration))
            .recomputeDurationIfOk()

    /** « +10 s » : une commande annulable, plafonnée à [ClipWindowResolver.MAXIMUM_END], posée comme PLANCHER d'auteur. */
    fun extendSlideDuration(seconds: Float = EXTEND_STEP_SECONDS): TimelineEditor {
        val target = minOf(ClipWindowResolver.MAXIMUM_END, project.slideDuration + seconds)
        if (target - project.slideDuration <= DURATION_EPSILON) return this
        val command = SetSlideDurationCommand(
            oldDuration = project.slideDuration, newDuration = target, oldAuthoredDuration = authoredSlideDuration,
        )
        return run(command).copy(authoredSlideDuration = target)
    }

    // endregion

    // region annuler / rétablir

    /** Annuler restaure le CONTENU, et la durée suit (sans toast : l'effet est connu de qui l'a demandé). */
    fun undo(): TimelineEditor {
        val step = stack.undo() ?: return this
        return try {
            val reverted = copy(project = step.command.revert(project), stack = step.stack)
            val command = step.command
            val restored = if (command is SetSlideDurationCommand) reverted.copy(authoredSlideDuration = command.oldAuthoredDuration) else reverted
            restored.recomputeDuration(announcing = false)
        } catch (error: EditCommandError) {
            copy(errorMessage = error.message)
        }
    }

    fun redo(): TimelineEditor {
        val step = stack.redo() ?: return this
        return try {
            val applied = copy(project = step.command.apply(project), stack = step.stack)
            val command = step.command
            val restored = if (command is SetSlideDurationCommand) applied.copy(authoredSlideDuration = command.newDuration) else applied
            restored.recomputeDuration(announcing = false)
        } catch (error: EditCommandError) {
            copy(errorMessage = error.message)
        }
    }

    // endregion

    /**
     * La durée de la slide dérive du contenu le plus long (le clip synthétique, permanent, n'y compte pas), avec la
     * demande d'auteur en PLANCHER. Le toast ne sonne qu'une fois le glissé fini, contre la durée d'AVANT le geste.
     */
    internal fun recomputeDuration(announcing: Boolean): TimelineEditor {
        val real = project.mediaObjects.filterNot { TimelineSlideBinding.isSynthetic(it.id) }
        val derived = StorySlideDuration.contentDerivedSeconds(
            mediaObjects = real.ifEmpty { null },
            audioPlayerObjects = project.audioPlayerObjects.ifEmpty { null },
            textObjects = project.textObjects,
        ).toFloat()
        val auto = maxOf(derived, authoredSlideDuration ?: 0f)
        val live = project.slideDuration
        val changed = abs(auto - live) > DURATION_EPSILON
        val updated = if (changed) copy(project = project.copy(slideDuration = auto), playhead = minOf(playhead, auto)) else this
        if (selection.activeDrag != null) return updated
        val baseline = durationBeforeDrag ?: live
        val cleared = updated.copy(durationBeforeDrag = null)
        val notify = announcing && abs(auto - baseline) > DURATION_EPSILON
        return if (notify) cleared.copy(durationNotice = DurationNotice(baseline, auto)) else cleared
    }

    private fun recomputeDurationIfOk(): TimelineEditor = if (errorMessage == null) recomputeDuration(announcing = true) else this

    private fun run(command: EditCommand): TimelineEditor = try {
        copy(project = command.apply(project), stack = stack.push(command))
    } catch (error: EditCommandError) {
        copy(errorMessage = error.message)
    }

    private fun withStart(clipId: String, start: Float): TimelineEditor {
        val kind = project.kindOf(clipId) ?: return this
        return copy(project = MoveClipCommand(clipId = clipId, kind = kind, oldStartTime = 0f, newStartTime = start).apply(project))
    }

    companion object {
        const val EXTEND_STEP_SECONDS: Float = 10f
        private const val EPSILON = 0.0005f
        private const val DURATION_EPSILON = 0.05f
        private const val MIN_SPLIT_HALF = 0.001f

        /** Ouvre un projet : la durée d'auteur est ce qui dépasse la durée dérivée du contenu (un réglage explicite). */
        fun open(project: TimelineProject, stack: CommandStack = CommandStack()): TimelineEditor {
            val real = project.mediaObjects.filterNot { TimelineSlideBinding.isSynthetic(it.id) }
            val derived = StorySlideDuration.contentDerivedSeconds(
                mediaObjects = real.ifEmpty { null },
                audioPlayerObjects = project.audioPlayerObjects.ifEmpty { null },
                textObjects = project.textObjects,
            ).toFloat()
            val authored = project.slideDuration.takeIf { it - derived > DURATION_EPSILON }
            return TimelineEditor(project = project, stack = stack, authoredSlideDuration = authored)
        }
    }
}

private fun SnapCandidate.Kind.toSnappedKind(): ClipSelectionState.SnappedKind = when (this) {
    SnapCandidate.Kind.PLAYHEAD -> ClipSelectionState.SnappedKind.PLAYHEAD
    SnapCandidate.Kind.CLIP_START, SnapCandidate.Kind.SLIDE_START -> ClipSelectionState.SnappedKind.CLIP_START
    SnapCandidate.Kind.CLIP_END, SnapCandidate.Kind.SLIDE_END -> ClipSelectionState.SnappedKind.CLIP_END
    SnapCandidate.Kind.KEYFRAME -> ClipSelectionState.SnappedKind.KEYFRAME
    SnapCandidate.Kind.GRID_MAJOR, SnapCandidate.Kind.GRID_MINOR -> ClipSelectionState.SnappedKind.GRID
}

private fun TimelineClipKind.hasVolume(): Boolean = this == TimelineClipKind.VIDEO || this == TimelineClipKind.IMAGE || this == TimelineClipKind.AUDIO

private fun TimelineClipKind.hasFades(): Boolean = this != TimelineClipKind.STICKER && this != TimelineClipKind.PLACE
