package me.meeshy.sdk.model

/**
 * Les effets portent-ils de quoi composer une scène (objets posés, sons, dessin) ? Un fond seul n'en est pas une.
 * Site unique : le lecteur de réels et la couverture d'un réel dans le fil lisent la même règle.
 */
public fun StoryEffects?.composesScene(): Boolean = this != null && (
    mediaObjects.orEmpty().isNotEmpty() ||
        textObjects.isNotEmpty() ||
        stickerObjects.orEmpty().isNotEmpty() ||
        audioPlayerObjects.orEmpty().isNotEmpty() ||
        drawingStrokes.orEmpty().isNotEmpty()
    )
