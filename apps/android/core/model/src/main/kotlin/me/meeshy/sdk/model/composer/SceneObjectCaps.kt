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
    const val TEXT: Int = 5

    /** Médias visuels ET sons confondus : la scène est pleine à dix. */
    const val MEDIA: Int = 10
    const val IMAGE: Int = 5
    const val VIDEO: Int = 4
    const val AUDIO: Int = 5
    const val STICKER: Int = 30

    /** Ce que l'auteur peut vouloir ajouter. */
    enum class Entry { TEXT, IMAGE, VIDEO, AUDIO, STICKER, PLACE }

    /** Pourquoi une entrée est grisée. */
    enum class Reason { TEXT_FULL, MEDIA_FULL, IMAGE_FULL, VIDEO_FULL, AUDIO_FULL, STICKER_FULL }

    sealed interface Verdict {
        data object Allowed : Verdict
        data class Refused(val reason: Reason) : Verdict
    }

    /** Le nombre de médias comptés contre le plafond de dix : médias visuels + sons, fonds compris. */
    fun mediaCount(lists: SceneLists): Int = lists.medias.size + lists.audios.size

    /** La scène peut-elle porter un média ou un son de plus (dix en tout) ? */
    fun canAddMedia(lists: SceneLists): Boolean = mediaCount(lists) < MEDIA

    fun verdict(entry: Entry, lists: SceneLists): Verdict = when (entry) {
        Entry.TEXT -> refuseIf(lists.texts.size >= TEXT, Reason.TEXT_FULL)
        Entry.STICKER -> refuseIf(lists.stickers.size >= STICKER, Reason.STICKER_FULL)
        Entry.PLACE -> Verdict.Allowed
        Entry.IMAGE -> mediaFull(lists) ?: refuseIf(lists.medias.count { it.mediaType == "image" } >= IMAGE, Reason.IMAGE_FULL)
        Entry.VIDEO -> mediaFull(lists) ?: refuseIf(lists.medias.count { it.mediaType == "video" } >= VIDEO, Reason.VIDEO_FULL)
        Entry.AUDIO -> mediaFull(lists) ?: refuseIf(lists.audios.size >= AUDIO, Reason.AUDIO_FULL)
    }

    fun canAdd(entry: Entry, lists: SceneLists): Boolean = verdict(entry, lists) == Verdict.Allowed

    private fun mediaFull(lists: SceneLists): Verdict? =
        if (mediaCount(lists) >= MEDIA) Verdict.Refused(Reason.MEDIA_FULL) else null

    private fun refuseIf(full: Boolean, reason: Reason): Verdict =
        if (full) Verdict.Refused(reason) else Verdict.Allowed
}
