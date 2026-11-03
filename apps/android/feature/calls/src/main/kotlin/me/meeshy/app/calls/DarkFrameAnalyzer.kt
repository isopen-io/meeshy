package me.meeshy.app.calls

import me.meeshy.sdk.model.call.DarkFrameEvent
import me.meeshy.sdk.model.call.DarkFramePolicy
import me.meeshy.sdk.model.call.DarkFrameState
import me.meeshy.sdk.model.call.FrameLuminance
import java.nio.ByteBuffer

/**
 * Lumière insuffisante sur MA caméra (iOS `DarkFrameDetector`) : la luminance moyenne du plan Y, échantillonnée
 * tous les 8 pixels, nourrit [DarkFramePolicy] (30 trames sombres de suite, retour immédiat à la lumière).
 * S'appelle sur le fil de capture : aucune allocation par trame, un état de taille fixe.
 */
class DarkFrameAnalyzer(
    private val policy: DarkFramePolicy = DarkFramePolicy(),
    private val onDarkChanged: (Boolean) -> Unit,
) {
    private var state = DarkFrameState.INITIAL

    /** Une trame I420 : [yPlane] est son plan de luminance, [rowStride] la longueur d'une ligne en octets. */
    fun onFrame(yPlane: ByteBuffer, width: Int, height: Int, rowStride: Int = width) {
        val average = FrameLuminance.averageOfYPlane(yPlane, width, height, rowStride) ?: return
        val decision = policy.reduce(state, average)
        state = decision.state
        when (decision.event) {
            DarkFrameEvent.Covered -> onDarkChanged(true)
            DarkFrameEvent.Uncovered -> onDarkChanged(false)
            DarkFrameEvent.None -> Unit
        }
    }

    /** Fin de capture ou caméra coupée : la mesure repart de zéro, et la lumière est rendue. */
    fun reset() {
        val wasDark = state.isCovered
        state = DarkFrameState.INITIAL
        if (wasDark) onDarkChanged(false)
    }
}
