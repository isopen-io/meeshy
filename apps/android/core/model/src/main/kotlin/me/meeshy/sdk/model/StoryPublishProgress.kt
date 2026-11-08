package me.meeshy.sdk.model

/**
 * La progression PONDÉRÉE d'une publication de story (miroir de `runStoryUpload`, iOS) : chaque slide pèse une part égale ;
 * dans une slide, le fond pèse 30 %, les médias de premier plan les 50 % suivants, le reste (stickers, sons, création) 20 %.
 */
object StoryPublishProgress {
    const val BACKGROUND_WEIGHT: Double = 0.30
    const val MEDIA_WEIGHT: Double = 0.50

    sealed interface Step {
        /** Le fond de la slide est parti (ou n'existait pas). */
        data object Background : Step

        /** [done] médias de premier plan sur [total] sont partis. */
        data class Media(val done: Int, val total: Int) : Step

        /** La slide est entièrement publiée (ou l'était déjà). */
        data object Done : Step
    }

    /** La fraction globale dans [0, 1] après [step] de la slide [slideIndex] sur [slideCount]. */
    fun fraction(slideIndex: Int, slideCount: Int, step: Step): Double {
        val share = 1.0 / maxOf(1, slideCount)
        val within = when (step) {
            Step.Background -> BACKGROUND_WEIGHT
            is Step.Media -> BACKGROUND_WEIGHT + MEDIA_WEIGHT * (step.done.toDouble() / maxOf(1, step.total)).coerceIn(0.0, 1.0)
            Step.Done -> 1.0
        }
        return ((slideIndex * share) + within * share).coerceIn(0.0, 1.0)
    }
}
