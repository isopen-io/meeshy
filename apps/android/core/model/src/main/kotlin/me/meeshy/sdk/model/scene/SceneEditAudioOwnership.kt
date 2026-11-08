package me.meeshy.sdk.model.scene

/**
 * Le son de la scène composée n'a QU'UN propriétaire, et il se passe sans repartir — miroir de `EditAudioOwnership`
 * (iOS, #10362). Le composeur monte plusieurs canevas sonores à la fois (la scène, puis l'éditeur d'objet plein écran
 * qui rend la MÊME slide) : le DERNIER monté joue, les autres se taisent, et l'éditeur qui se ferme rend la main à la
 * scène, qui reprend à la phase partagée au lieu de repartir de zéro.
 */
public class SceneEditAudioOwnership<K : Any> {
    private val claimants = ArrayList<K>()

    public val owner: K? get() = claimants.lastOrNull()

    /** Personne ne tient la main, ou c'est [id] qui la tient. */
    public fun mayPlay(id: K): Boolean = owner.let { it == null || it == id }

    /** [id] prend la main — en haut de la pile, même s'il y était déjà. */
    public fun claim(id: K) {
        claimants.remove(id)
        claimants.add(id)
    }

    /** [id] rend la main. Rend le NOUVEAU propriétaire quand [id] la tenait, `null` sinon : seul un départ du propriétaire réveille quelqu'un. */
    public fun release(id: K): K? {
        val wasOwner = owner == id
        claimants.remove(id)
        return if (wasOwner) owner else null
    }

    /** Ne garde que les canevas encore vivants : un canevas libéré sans `release` ne confisque pas la main pour toujours. */
    public fun prune(live: Set<K>) {
        claimants.retainAll(live)
    }
}

/** L'origine `t = 0` (horloge monotone, ms) de la passe sonore d'édition, pour UNE slide. */
public data class SceneEditAudioPhase(val slideId: String, val originMs: Long)

public object SceneEditAudioClock {
    /** L'écoulé de slide (secondes) où entre une passe planifiée à neuf : la phase partagée si elle vaut pour cette slide, sinon [fallbackElapsed]. */
    public fun slideElapsedSeconds(phase: SceneEditAudioPhase?, slideId: String, nowMs: Long, fallbackElapsed: Double): Double {
        if (phase == null || phase.slideId != slideId || phase.originMs > nowMs) return fallbackElapsed
        return (nowMs - phase.originMs) / 1000.0
    }
}
