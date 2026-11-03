package me.meeshy.ui.story.canvas

import me.meeshy.sdk.model.scene.SceneRenderItem

/**
 * Ce que la scène attend avant d'être « prête » (iOS `onContentReady`) : l'adresse de chaque image de premier plan. Une
 * scène sans image — slide vierge, tout hors ligne — est prête d'emblée : aucun spinner, le placeholder s'affiche.
 */
internal class SceneReadiness(items: List<SceneRenderItem>, mediaUrlOf: (String) -> String?, isReader: Boolean) {
    private val waiting: MutableSet<String> = items
        .filter { it.kind == me.meeshy.sdk.model.scene.MeeshySceneObject.Kind.MEDIA }
        .mapNotNull { it.resolvedUrl(mediaUrlOf, isReader) }
        .toMutableSet()
    private var fired = false

    val isReady: Boolean get() = waiting.isEmpty()

    /** [url] est résolue ; vrai UNE seule fois, quand la dernière attendue l'est. */
    fun resolve(url: String): Boolean {
        val wasWaiting = waiting.remove(url)
        if (!wasWaiting || waiting.isNotEmpty() || fired) return false
        fired = true
        return true
    }
}
