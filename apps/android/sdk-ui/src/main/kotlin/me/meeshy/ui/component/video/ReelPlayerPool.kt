package me.meeshy.ui.component.video

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import me.meeshy.ui.component.media.PlayerCensus

/**
 * **Le pool de lecteurs des réels** (iOS `StoryMediaLoader`, borné à trois, éviction FIFO).
 *
 * Un lecteur qui sort d'une surface ne se détruit pas : il retourne ici, prêt à resservir, et le
 * plus ANCIEN des lecteurs au repos part quand le pool dépasse sa borne. Générique pour se prouver sans
 * décodeur ; [ReelPlayers] l'instancie sur ExoPlayer.
 */
internal class ReelPlayerPool<T : Any>(
    private val capacity: Int = DEFAULT_CAPACITY,
    private val create: () -> T,
    private val reset: (T) -> Unit,
    private val destroy: (T) -> Unit,
) {
    private val idle = ArrayDeque<T>()

    val idleCount: Int get() = idle.size

    /** Un lecteur au repos (le plus récemment rendu) s'il y en a un, sinon un neuf. */
    @Synchronized
    fun acquire(): T = idle.removeLastOrNull() ?: create()

    /** Rend [player] au pool, réinitialisé ; le plus ancien du pool est détruit au-delà de la borne. */
    @Synchronized
    fun release(player: T) {
        reset(player)
        idle.addLast(player)
        while (idle.size > capacity) destroy(idle.removeFirst())
    }

    /** Détruit [player] sans le rendre (un lecteur dont l'état ne se remet pas à zéro). */
    fun discard(player: T) = destroy(player)

    /** Libère tous les lecteurs au repos (mémoire basse). */
    @Synchronized
    fun trim() {
        while (idle.isNotEmpty()) destroy(idle.removeFirst())
    }

    companion object {
        const val DEFAULT_CAPACITY: Int = 3
    }
}

/**
 * Le pool unique d'[ExoPlayer] de la couche vidéo : un composable n'instancie plus jamais de lecteur
 * hors de lui. Il se vide de lui-même sur `onTrimMemory`.
 */
@UnstableApi
internal object ReelPlayers {

    private var pool: ReelPlayerPool<ExoPlayer>? = null
    private var owner: Context? = null

    /** Le pool est lié à l'application qui l'a créé : une autre application (tests) en obtient un neuf. */
    @Synchronized
    fun get(context: Context): ReelPlayerPool<ExoPlayer> {
        val app = context.applicationContext
        pool?.takeIf { owner === app }?.let { return it }
        pool?.trim()
        return build(app).also {
            pool = it
            owner = app
        }
    }

    private fun build(app: Context): ReelPlayerPool<ExoPlayer> {
        val created = ReelPlayerPool(
            create = {
                PlayerCensus.record()
                ExoPlayer.Builder(app).build()
            },
            reset = { player ->
                player.stop()
                player.clearMediaItems()
                player.playWhenReady = false
                player.volume = 1f
            },
            destroy = { player -> runCatching { player.release() } },
        )
        app.registerComponentCallbacks(
            object : ComponentCallbacks2 {
                override fun onTrimMemory(level: Int) {
                    if (level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) created.trim()
                }

                override fun onConfigurationChanged(newConfig: Configuration) = Unit

                @Deprecated("Remplacé par onTrimMemory")
                override fun onLowMemory() = created.trim()
            },
        )
        return created
    }
}
