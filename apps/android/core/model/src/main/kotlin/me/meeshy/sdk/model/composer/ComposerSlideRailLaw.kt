package me.meeshy.sdk.model.composer

/** Which tiles of the slide rail exist, navigate and carry the bin — port of iOS `ComposerHeaderTiles`. */
object ComposerHeaderTiles {
    /** The rail stands as soon as a scene EXISTS; a lone scene counts only once it is mounted (no black tile for an absent scene). */
    fun showsRail(sceneCount: Int, scenePresent: Boolean): Boolean = sceneCount > 1 || (sceneCount == 1 && scenePresent)

    /** Tiles are buttons from two scenes: alone, they lead nowhere and must not announce themselves as activable. */
    fun tilesNavigate(sceneCount: Int): Boolean = sceneCount > 1

    /** The bin belongs to the CURRENT tile only, and never under two scenes (removing the last one is a no-op). */
    fun showsDelete(sceneIndex: Int, currentIndex: Int, sceneCount: Int): Boolean = sceneCount > 1 && sceneIndex == currentIndex
}

/** What touching (+) does: add, or say why not (iOS `ComposerSceneAddition`). */
enum class ComposerSceneAddition {
    ADDED, REFUSED_AT_CAP;

    companion object {
        fun outcome(canAddSlide: Boolean): ComposerSceneAddition = if (canAddSlide) ADDED else REFUSED_AT_CAP
    }
}

/** Deleting a scene destroys its content: it asks first only when there is something to lose. */
object ComposerSlideDeletion {
    fun needsConfirmation(holdsMatter: Boolean): Boolean = holdsMatter
}

/** The haptic cadence of a tile dragged along the rail: one tick each time it crosses into another slot. */
object ComposerSlideDrag {
    fun ticks(previousTarget: Int, target: Int): Boolean = previousTarget != target
}
