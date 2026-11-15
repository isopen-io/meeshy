package me.meeshy.app.stories

/**
 * La scène a-t-elle besoin de l'horloge de lecture ? Une slide dont aucun objet n'a de
 * fenêtre d'apparition, de fondu, de keyframe ni de transition de clip est statique : la
 * recomposer à chaque image pour rien coûterait une passe de composition par frame. Seule
 * une slide « timeline » lit la tête de lecture.
 */
internal val StorySlideView.needsPlayhead: Boolean
    get() = foregroundMedia.any {
        it.startTime > 0.0 || it.duration > 0.0 || it.fadeIn > 0.0 || it.fadeOut > 0.0 ||
            it.keyframes.isNotEmpty() || it.clipTransitions.isNotEmpty()
    } || textObjects.any {
        it.startTime > 0.0 || it.duration > 0.0 || it.fadeIn > 0.0 || it.fadeOut > 0.0 || it.keyframes.isNotEmpty()
    } || stickers.any {
        it.startTime > 0.0 || it.duration > 0.0 || it.fadeIn > 0.0 || it.fadeOut > 0.0
    } || audioChips.any { it.startTime > 0.0 || it.duration > 0.0 }
