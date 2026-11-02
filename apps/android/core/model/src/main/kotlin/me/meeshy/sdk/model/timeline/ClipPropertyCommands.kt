package me.meeshy.sdk.model.timeline

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.ClipTransform
import java.util.UUID

private fun newId(): String = UUID.randomUUID().toString()

private fun now(): Long = System.currentTimeMillis()

/** Propriété d'un clip éditée par [SetClipPropertyCommand] : l'ancienne et la nouvelle valeur voyagent ensemble. */
@Serializable
sealed interface ClipProperty {
    @Serializable @SerialName("volume") data class Volume(val old: Float, val new: Float) : ClipProperty
    @Serializable @SerialName("fadeIn") data class FadeIn(val old: Double? = null, val new: Double? = null) : ClipProperty
    @Serializable @SerialName("fadeOut") data class FadeOut(val old: Double? = null, val new: Double? = null) : ClipProperty
    @Serializable @SerialName("loop") data class Loop(val old: Boolean? = null, val new: Boolean? = null) : ClipProperty
    @Serializable @SerialName("isBackground") data class IsBackground(val old: Boolean? = null, val new: Boolean? = null) : ClipProperty
    @Serializable @SerialName("isLocked") data class IsLocked(val old: Boolean? = null, val new: Boolean? = null) : ClipProperty

    /** Coupe l'atténuation automatique du clip — vidéo uniquement. */
    @Serializable @SerialName("isDuckingDisabled") data class IsDuckingDisabled(val old: Boolean? = null, val new: Boolean? = null) : ClipProperty
    @Serializable @SerialName("name") data class Name(val old: String? = null, val new: String? = null) : ClipProperty

    /** Une seule entrée d'annulation par réglage : la transformation COMPLÈTE. */
    @Serializable @SerialName("transform") data class Transform(val old: ClipTransform, val new: ClipTransform) : ClipProperty
}

@Serializable
@SerialName("setClipProperty")
data class SetClipPropertyCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val property: ClipProperty,
) : EditCommand {

    override fun apply(project: TimelineProject) = mutate(project, useNew = true)

    override fun revert(project: TimelineProject) = mutate(project, useNew = false)

    private fun mutate(project: TimelineProject, useNew: Boolean): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.updateMedia(clipId) { applyTo(it, useNew) }
        TimelineClipKind.AUDIO -> project.updateAudio(clipId) { applyTo(it, useNew) }
        TimelineClipKind.TEXT -> project.updateText(clipId) { applyTo(it, useNew) }
        TimelineClipKind.STICKER ->
            throw EditCommandError.InvalidState("sticker properties are edited on the canvas, not the timeline")
        TimelineClipKind.PLACE ->
            throw EditCommandError.InvalidState("place properties are edited on the canvas, not the timeline")
    }

    private fun applyTo(media: StoryMediaObject, useNew: Boolean): StoryMediaObject = when (val p = property) {
        is ClipProperty.Volume -> media.withVolumePreservingMuteMemento(if (useNew) p.new else p.old)
        is ClipProperty.FadeIn -> media.copy(fadeIn = if (useNew) p.new else p.old)
        is ClipProperty.FadeOut -> media.copy(fadeOut = if (useNew) p.new else p.old)
        is ClipProperty.Loop -> media.copy(loop = (if (useNew) p.new else p.old) ?: false)
        is ClipProperty.IsBackground -> media.copy(isBackground = (if (useNew) p.new else p.old) ?: false)
        is ClipProperty.IsLocked -> media
        is ClipProperty.IsDuckingDisabled -> media.copy(isDuckingDisabled = if (useNew) p.new else p.old)
        is ClipProperty.Name -> media.copy(name = if (useNew) p.new else p.old)
        is ClipProperty.Transform -> (if (useNew) p.new else p.old).let {
            media.copy(x = it.x, y = it.y, scale = it.scale, rotation = it.rotation, zIndex = it.zIndex)
        }
    }

    private fun applyTo(audio: StoryAudioPlayerObject, useNew: Boolean): StoryAudioPlayerObject = when (val p = property) {
        is ClipProperty.Volume -> audio.withVolumePreservingMuteMemento(if (useNew) p.new else p.old)
        is ClipProperty.FadeIn -> audio.copy(fadeIn = (if (useNew) p.new else p.old)?.toFloat())
        is ClipProperty.FadeOut -> audio.copy(fadeOut = (if (useNew) p.new else p.old)?.toFloat())
        is ClipProperty.Loop -> audio.copy(loop = if (useNew) p.new else p.old)
        is ClipProperty.IsBackground -> audio.copy(isBackground = if (useNew) p.new else p.old)
        is ClipProperty.Name -> audio.copy(name = if (useNew) p.new else p.old)
        // Un son ne se voit pas : transform n'a pas de rendu ; le ducking atténue la piste des vidéos.
        is ClipProperty.IsLocked, is ClipProperty.IsDuckingDisabled, is ClipProperty.Transform -> audio
    }

    private fun applyTo(text: StoryTextObject, useNew: Boolean): StoryTextObject = when (val p = property) {
        is ClipProperty.IsLocked -> text.copy(isLocked = if (useNew) p.new else p.old)
        is ClipProperty.FadeIn -> text.copy(fadeIn = if (useNew) p.new else p.old)
        is ClipProperty.FadeOut -> text.copy(fadeOut = if (useNew) p.new else p.old)
        is ClipProperty.Name -> text.copy(name = if (useNew) p.new else p.old)
        is ClipProperty.Transform -> (if (useNew) p.new else p.old).let {
            text.copy(x = it.x, y = it.y, scale = it.scale, rotation = it.rotation, zIndex = it.zIndex)
        }
        is ClipProperty.Volume, is ClipProperty.Loop, is ClipProperty.IsBackground, is ClipProperty.IsDuckingDisabled -> text
    }
}

/**
 * Allonge (ou raccourcit) la timeline elle-même — ce que pose « +10 s ». Le projet ne porte que la
 * durée courante ; [oldAuthoredDuration] est la durée d'AUTEUR d'avant (`null` : la longueur
 * dérivait du contenu), conservée pour que l'appelant restitue le pin à l'annulation.
 */
@Serializable
@SerialName("setSlideDuration")
data class SetSlideDurationCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val oldDuration: Float,
    val newDuration: Float,
    val oldAuthoredDuration: Float? = null,
) : EditCommand {
    override fun apply(project: TimelineProject) = project.copy(slideDuration = newDuration)

    override fun revert(project: TimelineProject) = project.copy(slideDuration = oldDuration)
}

private fun StoryMediaObject.withVolumePreservingMuteMemento(newVolume: Float): StoryMediaObject {
    val clamped = maxOf(0f, newVolume)
    val memento = when {
        clamped > 0f -> null
        volume > 0f -> volume
        else -> mutedVolumeMemento
    }
    return copy(volume = clamped, mutedVolumeMemento = memento)
}

private fun StoryAudioPlayerObject.withVolumePreservingMuteMemento(newVolume: Float): StoryAudioPlayerObject {
    val clamped = maxOf(0f, newVolume)
    val memento = when {
        clamped > 0f -> null
        volume > 0f -> volume
        else -> mutedVolumeMemento
    }
    return copy(volume = clamped, mutedVolumeMemento = memento)
}
