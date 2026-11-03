package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.composer.scene.SceneExportPhase
import me.meeshy.sdk.model.composer.scene.SceneExportState

/**
 * Le voile d'un export en cours (miroir de `ComposerExportProgressVeil` iOS) : projection de [SceneExportState]. Aucun
 * voile hors d'un bake ; le voile est annulable tant que le fichier n'est pas livré.
 */
sealed interface ComposerExportProgress {
    val percent: Int
    val cancelable: Boolean get() = true

    data class Rendering(override val percent: Int) : ComposerExportProgress

    /** Le rendu est fini et se relit : barre pleine, indéterminée à l'écran. */
    data object Verifying : ComposerExportProgress {
        override val percent: Int = 100
    }

    companion object {
        fun of(state: SceneExportState): ComposerExportProgress? {
            val running = state as? SceneExportState.Running ?: return null
            return when (running.phase) {
                SceneExportPhase.VERIFYING -> Verifying
                SceneExportPhase.RENDERING -> Rendering(Math.round(running.fraction.coerceIn(0f, 1f) * 100))
            }
        }
    }
}
