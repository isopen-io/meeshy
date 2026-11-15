package me.meeshy.app.stories

/**
 * L'état des médias à lecture continue de la slide courante, tel que les lecteurs le rapportent. [videoBuffering] :
 * le fond vidéo attend des données (chargement initial ou famine en cours de lecture) ; [audioPending] : une piste
 * sonore n'est pas encore prête. Avant le départ de l'horloge, l'un ou l'autre la retient ; après, il la FIGE.
 */
data class StoryMediaReadiness(
    val videoBuffering: Boolean = false,
    val audioPending: Boolean = false,
    /** Une vidéo de premier plan n'est pas encore prête : elle retient le DÉPART d'une slide sans fond visuel, jamais ne fige la lecture. */
    val foregroundPending: Boolean = false,
) {
    val waiting: Boolean get() = videoBuffering || audioPending

    /** Ce qui retient le DÉPART du compte à rebours : une attente de lecture, ou un premier plan pas prêt. */
    val holdsStart: Boolean get() = waiting || foregroundPending

    companion object {
        val Ready = StoryMediaReadiness()
    }
}

/**
 * Pure decision for whether the story viewer's auto-advance countdown may run
 * for the current slide *now*.
 *
 * The Instant-App rule for stories: a slow image must never auto-advance before
 * it has painted. Where iOS starts its 5s timer on slide appearance regardless
 * of media-load state (so a still-loading photo can be skipped before the user
 * ever sees it), Android gates the timer on actual readiness:
 *
 * - no slide → nothing to time;
 * - a text-only slide (no image) paints immediately → count down at once;
 * - an image slide → count down only once that image URL has resolved
 *   (loaded or failed — a failure resolves too so the viewer never hangs);
 * - a video or audio slide → never while a player still waits for data ([StoryMediaReadiness]).
 *
 * The set of resolved URLs is owned by the ViewModel and fed from the live
 * `AsyncImage` load callbacks; this unit holds no clock and no IO so the gate
 * stays fully testable.
 */
object StoryAutoAdvanceGate {

    fun shouldCountdown(
        slide: StorySlideView?,
        resolvedImageUrls: Set<String>,
        readiness: StoryMediaReadiness = StoryMediaReadiness.Ready,
    ): Boolean {
        if (slide == null || readiness.holdsStart) return false
        val imageUrl = slide.imageUrl ?: return true
        return imageUrl in resolvedImageUrls
    }
}
