package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryLocationObject

/**
 * La slide telle que le canevas la voit : un id, les effets et les pastilles de lieu (absentes du modèle Android des
 * effets). Miroir de la `StorySlide` qu'iOS compare avant de pousser un changement dans `StoryCanvasUIView`.
 */
public data class SceneSlide(
    val id: String,
    val effects: StoryEffects,
    val places: List<StoryLocationObject> = emptyList(),
) {
    public val lists: SceneLists get() = effects.sceneLists(places.ifEmpty { effects.locationObjects })
}

/** Ce que le canevas doit faire d'un changement de slide. */
public sealed interface SceneSlideChange {
    /** Rien de ce que le canevas peint n'a changé : aucune reconstruction. */
    public data object Unchanged : SceneSlideChange

    /** Un geste tient [id] : seule la transformée de ce nœud change, la reconstruction attend le lâcher. */
    public data class TransformOnly(val id: String) : SceneSlideChange

    /** Reconstruire la scène ; [restartAudio] : la COMPOSITION a changé, l'audio se re-planifie (pas pour une lettre tapée). */
    public data class Rebuild(val restartAudio: Boolean) : SceneSlideChange
}

/**
 * Miroir de `StoryCanvasRepresentable.slidesEqualForCanvas`, `StorySlideStructureRules.fingerprint` et de la garde de
 * `slideDidChange` : la décision PURE qui évite de recomposer la scène à chaque pas d'un geste.
 */
public object SceneSlideDiff {

    /** Deux slides de même id et de même contenu peint sont égales pour le canevas. */
    public fun equalForCanvas(a: SceneSlide, b: SceneSlide): Boolean =
        a.id == b.id && a.effects == b.effects && a.places == b.places

    /**
     * L'empreinte de COMPOSITION (qui est là, pas où ni comment) : change à l'ajout, au retrait ou au passage fond / premier
     * plan d'un objet, jamais à une frappe ni à un déplacement.
     */
    public fun structureFingerprint(slide: SceneSlide): String {
        val lists = slide.lists
        val parts = lists.texts.map { "t:${it.id}" } +
            lists.medias.map { "m:${it.id}:${if (it.isBackground) 1 else 0}" } +
            lists.stickers.map { "s:${it.id}" } +
            lists.places.map { "l:${it.id}" } +
            lists.audios.map { "a:${it.id}:${if (it.isBackground == true) 1 else 0}" } +
            "bga:${slide.effects.backgroundAudioId ?: "-"}"
        return parts.sorted().joinToString("|")
    }

    /** La décision pour passer de [old] à [new] pendant que [manipulatedId] (si non nul) est tenu par un geste. */
    public fun change(old: SceneSlide, new: SceneSlide, manipulatedId: String? = null): SceneSlideChange = when {
        equalForCanvas(old, new) -> SceneSlideChange.Unchanged
        manipulatedId != null && old.id == new.id -> SceneSlideChange.TransformOnly(manipulatedId)
        else -> SceneSlideChange.Rebuild(restartAudio = old.id != new.id || structureFingerprint(old) != structureFingerprint(new))
    }
}
