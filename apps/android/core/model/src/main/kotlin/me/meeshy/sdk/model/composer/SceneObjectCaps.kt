package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.scene.SceneLists

/**
 * Les plafonds d'une slide (miroir de `canAddText` / `canAddMedia` / `canAddImage` /
 * `canAddVideo` / `canAddAudio` de `StoryComposerViewModel+Elements.swift`).
 *
 * Une entrée d'ajout qui atteint son plafond est ABSENTE ou GRISÉE avec sa raison : on ne
 * propose pas un geste que la pose refuserait ensuite en silence.
 */
object SceneObjectCaps {
    const val TEXT: Int = StoryLimits.OBJECTS_PER_FAMILY

    /**
     * Médias VISUELS (images + vidéos) : cinquante. Le jeu de slides ne type pas ses médias, donc un seul seau
     * de cinquante garantit qu'aucune combinaison ne dépasse le plafond de cinquante images ou de cinquante
     * vidéos de la passerelle. Les sons ont leur propre seau [AUDIO] : ils ne partagent plus rien avec lui.
     */
    const val MEDIA: Int = StoryLimits.OBJECTS_PER_FAMILY
    const val IMAGE: Int = StoryLimits.OBJECTS_PER_FAMILY
    const val VIDEO: Int = StoryLimits.OBJECTS_PER_FAMILY
    const val AUDIO: Int = StoryLimits.OBJECTS_PER_FAMILY
    const val STICKER: Int = StoryLimits.OBJECTS_PER_FAMILY

    /** Ce que l'auteur peut vouloir ajouter. */
    enum class Entry { TEXT, IMAGE, VIDEO, AUDIO, STICKER, PLACE }

    /** Pourquoi une entrée est grisée. */
    enum class Reason { TEXT_FULL, MEDIA_FULL, IMAGE_FULL, VIDEO_FULL, AUDIO_FULL, STICKER_FULL }

    sealed interface Verdict {
        data object Allowed : Verdict
        data class Refused(val reason: Reason) : Verdict
    }

    /** Le nombre de médias visuels comptés contre [MEDIA], fonds compris. */
    fun mediaCount(lists: SceneLists): Int = lists.medias.size

    /** La scène peut-elle porter un média visuel de plus ? */
    fun canAddMedia(lists: SceneLists): Boolean = mediaCount(lists) < MEDIA

    /** Les places restantes pour un média visuel ; jamais négatif. */
    fun remainingMediaSlots(visualMedia: Int): Int = (MEDIA - visualMedia).coerceAtLeast(0)

    fun canAddMedia(visualMedia: Int): Boolean = remainingMediaSlots(visualMedia) > 0

    /** Les places restantes pour un son ; jamais négatif. */
    fun remainingAudioSlots(audios: Int): Int = (AUDIO - audios).coerceAtLeast(0)

    fun verdict(entry: Entry, lists: SceneLists): Verdict = when (entry) {
        Entry.TEXT -> refuseIf(lists.texts.size >= TEXT, Reason.TEXT_FULL)
        Entry.STICKER -> refuseIf(lists.stickers.size >= STICKER, Reason.STICKER_FULL)
        Entry.PLACE -> Verdict.Allowed
        Entry.IMAGE -> mediaFull(lists) ?: refuseIf(lists.medias.count { it.mediaType == "image" } >= IMAGE, Reason.IMAGE_FULL)
        Entry.VIDEO -> mediaFull(lists) ?: refuseIf(lists.medias.count { it.mediaType == "video" } >= VIDEO, Reason.VIDEO_FULL)
        Entry.AUDIO -> refuseIf(lists.audios.size >= AUDIO, Reason.AUDIO_FULL)
    }

    fun canAdd(entry: Entry, lists: SceneLists): Boolean = verdict(entry, lists) == Verdict.Allowed

    private fun mediaFull(lists: SceneLists): Verdict? =
        if (mediaCount(lists) >= MEDIA) Verdict.Refused(Reason.MEDIA_FULL) else null

    private fun refuseIf(full: Boolean, reason: Reason): Verdict =
        if (full) Verdict.Refused(reason) else Verdict.Allowed
}
