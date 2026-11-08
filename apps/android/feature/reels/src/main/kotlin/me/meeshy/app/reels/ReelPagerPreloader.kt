package me.meeshy.app.reels

import me.meeshy.sdk.model.ReelPreloadWindow
import me.meeshy.sdk.model.ReelVisitClock

/** Ce qu'un réel voisin offre à préparer : son fichier vidéo, son poster, les sons qu'il jouera. */
internal data class ReelPrepTarget(
    val id: String,
    val videoUrl: String?,
    val posterUrl: String?,
    val audioUrls: List<String> = emptyList(),
)

/** Une préparation demandée au pool : [preroll] prépare aussi le lecteur (N±1), [prefetchesAudio] charge le son. */
internal data class ReelPreparation(
    val target: ReelPrepTarget,
    val tier: ReelPreloadWindow.Tier,
    val preroll: Boolean,
    val prefetchesAudio: Boolean,
)

/** Le côté effets de bord du préchargement : un faux dans les tests, le cache média sur l'appareil. */
internal interface ReelPreparationPool {
    fun prepare(preparation: ReelPreparation)
    fun retire(reelId: String)
}

/**
 * **Le préchargeur du pager de réels** (iOS `ReelPrewarm` + `ReelPreloadWindow.plan`). À chaque réel posé,
 * il lit la fenêtre adaptative, prépare le SUIVANT ET le PRÉCÉDENT (lecteur prêt, poster, son), les paliers
 * plus lointains par fichier seul, et RETIRE ce qui a quitté la fenêtre : hors fenêtre, rien ne télécharge.
 */
internal class ReelPagerPreloader(
    private val pool: ReelPreparationPool,
    private val contextFor: (List<ReelPreloadWindow.Visit>) -> ReelPreloadWindow.Context,
) {
    private var clock = ReelVisitClock()
    private val live = LinkedHashMap<String, ReelPreloadWindow.Tier>()

    /** Le réel [index] vient d'être posé : la fenêtre se recalcule et le pool suit. */
    fun enter(index: Int, targets: List<ReelPrepTarget>, nowMs: Long) {
        clock = clock.enter(index, nowMs)
        val window = ReelPreloadWindow.window(contextFor(clock.visits))
        val plan = ReelPreloadWindow.plan(targets.size, index, window)
        val wanted = plan.associateBy { targets[it.index].id }
        live.keys.filter { it !in wanted }.forEach(::retire)
        plan.forEach { step -> prepare(targets[step.index], step.tier) }
    }

    /** Un réel qui quitte la fenêtre : ses transferts s'arrêtent. */
    fun retire(reelId: String) {
        if (live.remove(reelId) != null) pool.retire(reelId)
    }

    /** L'écran se ferme : plus rien ne se prépare ni ne télécharge. */
    fun releaseAll() {
        live.keys.toList().forEach(::retire)
        clock = ReelVisitClock()
    }

    private fun prepare(target: ReelPrepTarget, tier: ReelPreloadWindow.Tier) {
        if (live[target.id] == tier) return
        live[target.id] = tier
        pool.prepare(
            ReelPreparation(
                target = target,
                tier = tier,
                preroll = tier == ReelPreloadWindow.Tier.DECODE,
                prefetchesAudio = tier == ReelPreloadWindow.Tier.DECODE || tier == ReelPreloadWindow.Tier.MOUNT,
            ),
        )
    }
}
