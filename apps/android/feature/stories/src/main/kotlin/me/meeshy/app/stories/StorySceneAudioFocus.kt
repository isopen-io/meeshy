package me.meeshy.app.stories

/**
 * Une scène tient le focus audio UNE fois, comme la session audio unique d'iOS (#14611) : par son fond vidéo, sinon par
 * sa première vidéo posée. Les autres vidéos jouent leur son sans le demander — deux demandes dans une même scène
 * mettaient la première vidéo en pause et figeaient le lecteur comme pour un appel.
 */
internal object StorySceneAudioFocus {
    sealed interface Holder {
        data object Background : Holder
        data class Placed(val id: String) : Holder
    }

    fun holder(slide: StorySlideView): Holder? = when {
        slide.backgroundVideoUrl != null -> Holder.Background
        else -> slide.foregroundMedia.firstOrNull { it.isVideo }?.let { Holder.Placed(it.id) }
    }
}
