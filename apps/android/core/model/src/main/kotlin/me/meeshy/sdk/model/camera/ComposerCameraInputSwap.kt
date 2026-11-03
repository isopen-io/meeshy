package me.meeshy.sdk.model.camera

import me.meeshy.sdk.model.composer.capture.CaptureLensFacing

/** Ce qu'une bascule d'objectif touche de la session — la liaison CameraX en production, une doublure dans les témoins. */
interface ComposerCaptureInputGraph<Input : Any> {
    fun beginConfiguration()
    fun commitConfiguration()
    fun removeInput(input: Input)
    fun canAddInput(input: Input): Boolean

    /** `false` ⇒ la session a refusé l'entrée : rien n'est ajouté. */
    fun addInput(input: Input): Boolean
}

/**
 * Basculer d'objectif ne laisse jamais la session sans image (miroir de `ComposerCameraInputSwap` iOS, #9464).
 * La nouvelle entrée naît d'abord ; le retrait et l'ajout se font dans UNE configuration, et un refus remet
 * l'ancienne à sa place.
 */
object ComposerCameraInputSwap {
    enum class Outcome {
        /** La nouvelle entrée est en place. */
        SWAPPED,

        /** L'ancienne est restée (ou a été remise) : la position ne change pas. */
        KEPT,

        /** Aucune entrée vidéo : il n'y en avait pas, et la nouvelle a été refusée. */
        NONE,
    }

    /** L'objectif dont la position est publiée après la bascule ; `null` quand il n'y a plus d'entrée. */
    fun publishedPosition(outcome: Outcome, new: CaptureLensFacing, old: CaptureLensFacing?): CaptureLensFacing? =
        when (outcome) {
            Outcome.SWAPPED -> new
            Outcome.KEPT -> old
            Outcome.NONE -> null
        }

    /** [configure] règle l'entrée en place DANS la même transaction, avant sa validation. */
    fun <Input : Any> swap(
        graph: ComposerCaptureInputGraph<Input>,
        replacing: Input?,
        with: Input?,
        configure: (Outcome) -> Unit = {},
    ): Outcome {
        if (with == null) return if (replacing == null) Outcome.NONE else Outcome.KEPT
        graph.beginConfiguration()
        try {
            val issue = exchange(graph, replacing, with)
            configure(issue)
            return issue
        } finally {
            graph.commitConfiguration()
        }
    }

    private fun <Input : Any> exchange(graph: ComposerCaptureInputGraph<Input>, old: Input?, new: Input): Outcome {
        if (old != null) graph.removeInput(old)
        if (graph.canAddInput(new) && graph.addInput(new)) return Outcome.SWAPPED
        if (old == null) return Outcome.NONE
        graph.addInput(old)
        return Outcome.KEPT
    }
}
