package me.meeshy.sdk.model.scene

/** Ce que la slide a besoin de voir avant que son compte à rebours ne démarre (iOS `scheduleContentReadyEvaluation`). */
public sealed interface SceneReadinessKind {
    /** Aplat ou dégradé : dessiné tout de suite. */
    public data object Flat : SceneReadinessKind

    /** Image : prête au premier bitmap RÉEL (jamais le ThumbHash), ou au ThumbHash seul si elle n'a pas de bitmap à attendre. */
    public data object Image : SceneReadinessKind

    /** Vidéo : prête en `STATE_READY` (première image composée). */
    public data object Video : SceneReadinessKind

    public val isVisualMedia: Boolean get() = this is Image || this is Video
}

/**
 * **Le signal « le contenu de la slide est prêt »** — émis UNE fois par slide, ignoré hors de la slide courante
 * (la fenêtre de prélecture charge les voisines : leur arrivée ne démarre jamais le compte à rebours de l'affichée).
 *
 * Pure. Un fond de média visuel (image, vidéo) remplit déjà le cadre : un clip de premier plan lent ne le retient
 * jamais. Sur un aplat, le premier plan prêt (ou son garde-fou) ouvre le départ, pour ne pas montrer un rectangle vide.
 */
public class SceneContentReadiness {
    private var currentKey: String? = null
    private var kind: SceneReadinessKind = SceneReadinessKind.Flat
    private var backgroundReady = false
    private var foregroundReady = true
    private var foregroundTimedOut = false
    private var fired = false

    /** Une slide devient la courante : tout repart d'une page blanche. */
    public fun begin(slideKey: String, kind: SceneReadinessKind, foregroundVideosPending: Boolean = false) {
        currentKey = slideKey
        this.kind = kind
        backgroundReady = kind == SceneReadinessKind.Flat
        foregroundReady = !foregroundVideosPending
        foregroundTimedOut = false
        fired = false
    }

    /** Le fond est utilisable. Rend `true` si ce signal ouvre le départ (une seule fois, slide courante seulement). */
    public fun onBackgroundReady(slideKey: String): Boolean = signal(slideKey) { backgroundReady = true }

    /** Les vidéos de premier plan sont prêtes. */
    public fun onForegroundReady(slideKey: String): Boolean = signal(slideKey) { foregroundReady = true }

    /** Le garde-fou du premier plan a expiré : il ne retient plus le départ. */
    public fun onForegroundTimedOut(slideKey: String): Boolean = signal(slideKey) { foregroundTimedOut = true }

    /** Le garde-fou du fond lui-même (image jamais livrée, vidéo jamais prête) : le départ ne se bloque jamais. */
    public fun onBackgroundFailsafe(slideKey: String): Boolean = signal(slideKey) { backgroundReady = true }

    private inline fun signal(slideKey: String, update: () -> Unit): Boolean {
        if (slideKey != currentKey) return false
        update()
        if (fired || !backgroundReady) return false
        if (!kind.isVisualMedia && !foregroundReady && !foregroundTimedOut) return false
        fired = true
        return true
    }
}
