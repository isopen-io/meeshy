package me.meeshy.app.stories

import me.meeshy.sdk.model.SceneAudioStageRule
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.ComposerObjectKind

/**
 * L'ordre UNIQUE des objets d'une scène (#13852, le `zIndex` d'iOS `StoryComposerViewModel+ZOrder`) : textes, médias posés,
 * stickers, lieux et pastilles de son se rangent sur une seule pile, du fond vers le devant. Le rang est le `zIndex` que la
 * publication porte au lecteur ; à rang égal (une scène écrite avant la pile, tout à 0), l'ordre des familles tient, celui
 * que le lecteur peignait déjà (`StorySceneLayerOrder`) : textes, médias, stickers, lieux, puis le son. Le fond et le son
 * d'ambiance ne sont pas sur la pile : ils ne se posent pas sur la scène.
 */
internal object StorySceneStack {

    private data class Entry(val ref: SceneObjectRef, val z: Int, val family: Int)

    fun order(slide: StorySlide): List<SceneObjectRef> = entries(slide).map { it.ref }

    /** Le rang d'un objet qui se pose maintenant : au-dessus de tout ce que la scène porte. */
    fun nextZ(slide: StorySlide): Int = (entries(slide).filter { it.z != UNRANKED }.maxOfOrNull { it.z } ?: 0) + 1

    /**
     * Déplace [ref] d'un cran ou jusqu'à un bout de la pile, toutes familles confondues, puis renumérote la pile de 1 à n
     * — un rang par objet, plus aucune égalité. Même instance quand l'objet n'est pas sur la pile ou que le geste ne
     * changerait rien.
     */
    fun restacked(slide: StorySlide, ref: SceneObjectRef, op: StoryZOrder): StorySlide {
        val order = order(slide)
        val from = order.indexOf(ref)
        if (from < 0) return slide
        val target = when (op) {
            StoryZOrder.TO_BACK -> 0
            StoryZOrder.BACKWARD -> from - 1
            StoryZOrder.FORWARD -> from + 1
            StoryZOrder.TO_FRONT -> order.lastIndex
        }.coerceIn(0, order.lastIndex)
        if (target == from) return slide
        val moved = order.toMutableList().apply { add(target, removeAt(from)) }
        val rank = moved.withIndex().associate { (index, it) -> it to index + 1 }
        fun rankOf(kind: ComposerObjectKind, id: String, current: Int) = rank[SceneObjectRef(kind, id)] ?: current
        return slide.copy(
            elements = slide.elements.map { it.copy(zIndex = rankOf(ComposerObjectKind.TEXT, it.id, it.zIndex)) }.sortedBy { it.zIndex },
            stickers = slide.stickers.map { it.copy(zIndex = rankOf(ComposerObjectKind.STICKER, it.id, it.zIndex)) }.sortedBy { it.zIndex },
            placedMedia = slide.placedMedia.map { it.copy(zIndex = rankOf(ComposerObjectKind.MEDIA, it.id, it.zIndex)) },
            places = slide.places.map { it.copy(zIndex = rankOf(ComposerObjectKind.PLACE, it.id, it.zIndex)) },
            audio = slide.audio.map { track ->
                rank[SceneObjectRef(ComposerObjectKind.AUDIO, track.id)]?.let { track.copy(zIndex = it) } ?: track
            },
        )
    }

    private fun entries(slide: StorySlide): List<Entry> {
        val texts = slide.elements.map { Entry(SceneObjectRef(ComposerObjectKind.TEXT, it.id), it.zIndex, TEXT) }
        val media = slide.placedMedia.filter { it.mediaId != slide.backgroundMediaId }
            .map { Entry(SceneObjectRef(ComposerObjectKind.MEDIA, it.id), it.zIndex, MEDIA) }
        val stickers = slide.stickers.map { Entry(SceneObjectRef(ComposerObjectKind.STICKER, it.id), it.zIndex, STICKER) }
        val places = slide.places.map { Entry(SceneObjectRef(ComposerObjectKind.PLACE, it.id), it.zIndex, PLACE) }
        val voices = slide.audio.filter(SceneAudioStageRule::isStaged)
            .map { Entry(SceneObjectRef(ComposerObjectKind.AUDIO, it.id), it.zIndex ?: UNRANKED, AUDIO) }
        return (texts + media + stickers + places + voices).sortedWith(compareBy<Entry>({ it.z }, { it.family }))
    }

    /** Une pastille de son sans rang (écrite avant la pile, ou par un client qui ne le pose pas) reste au-dessus de tout, comme le lecteur l'a toujours peinte. */
    private const val UNRANKED = Int.MAX_VALUE

    private const val TEXT = 0
    private const val MEDIA = 1
    private const val STICKER = 2
    private const val PLACE = 3
    private const val AUDIO = 4
}

/** Restack [ref] sur la slide qui le porte ; même instance quand aucune ne le porte ou que rien ne change. */
internal fun StorySlideDeck.restacked(ref: SceneObjectRef, op: StoryZOrder): StorySlideDeck {
    val slide = slides.firstOrNull { ref in StorySceneStack.order(it) } ?: return this
    val next = StorySceneStack.restacked(slide, ref, op)
    if (next === slide) return this
    return copy(slides = slides.map { if (it.id == slide.id) next else it })
}

/** Les pistes posées sur la scène que [audio] ajoute à la slide : elles entrent en haut de la pile, dans l'ordre où elles arrivent. */
internal fun StorySlide.stackingNewVoices(audio: List<StoryAudioPlayerObject>): List<StoryAudioPlayerObject> {
    val staged = this.audio.filter(SceneAudioStageRule::isStaged).mapTo(mutableSetOf()) { it.id }
    val fresh = audio.filter { SceneAudioStageRule.isStaged(it) && it.id !in staged }.map { it.id }
    if (fresh.isEmpty()) return audio
    val base = StorySceneStack.nextZ(this)
    val ranks = fresh.withIndex().associate { (index, id) -> id to base + index }
    return audio.map { track -> ranks[track.id]?.let { track.copy(zIndex = it) } ?: track }
}
