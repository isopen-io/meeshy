package me.meeshy.ui.story.canvas

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.scene.SceneEditAudioClock
import me.meeshy.sdk.model.scene.SceneEditAudioOwnership
import me.meeshy.sdk.model.scene.SceneEditAudioPhase

/**
 * Le registre (fil principal) des canevas de COMPOSITION qui sonnent : le dernier monté possède le son, le précédent le
 * reprend à sa fermeture à la PHASE partagée de la slide — jamais depuis zéro (iOS `StoryCanvasUIView+EditAudioOwnership`).
 * [revision] change à chaque passage de main : les hôtes qui la lisent se recomposent.
 */
internal object SceneEditAudioOwners {
    private val stack = SceneEditAudioOwnership<Any>()
    private var phase: SceneEditAudioPhase? = null
    private val main = Handler(Looper.getMainLooper())

    var revision by mutableIntStateOf(0)
        private set

    fun claim(canvas: Any) {
        stack.claim(canvas)
        revision++
    }

    fun release(canvas: Any) {
        stack.release(canvas)
        revision++
        // Un canevas détaché puis rattaché dans la même passe retrouve la phase : elle ne s'oublie qu'un tour plus tard.
        if (stack.owner == null) main.post { if (stack.owner == null) phase = null }
    }

    fun mayPlay(canvas: Any): Boolean = stack.mayPlay(canvas)

    /** L'écoulé de [slideId] à [nowMs] : la phase partagée, sinon [ownElapsed] — et la phase naît alors de lui. */
    fun elapsed(slideId: String, nowMs: Long, ownElapsed: Double): Double {
        val shared = SceneEditAudioClock.slideElapsedSeconds(phase, slideId, nowMs, Double.NaN)
        if (!shared.isNaN()) return shared
        phase = SceneEditAudioPhase(slideId, nowMs - (ownElapsed * 1000.0).toLong())
        return ownElapsed
    }
}
