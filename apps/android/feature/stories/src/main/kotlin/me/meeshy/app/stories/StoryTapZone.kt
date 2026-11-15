package me.meeshy.app.stories

/**
 * Bande horizontale sous le doigt — iOS `StoryTapZone`. Les bords (30 % de la largeur
 * chacun) naviguent sans délai ; la bande centrale est réservée au double toucher qui
 * bascule la pause, pour que la navigation n'attende jamais l'échec d'un double toucher.
 */
enum class StoryTapZone {
    Previous, Center, Next;

    companion object {
        const val EDGE_FRACTION: Float = 0.30f

        fun of(x: Float, width: Float): StoryTapZone {
            if (width <= 0f) return Next
            val edge = width * EDGE_FRACTION
            return when {
                x < edge -> Previous
                x >= width - edge -> Next
                else -> Center
            }
        }
    }
}
