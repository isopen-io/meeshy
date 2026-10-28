package me.meeshy.sdk.model.composer.scene

import me.meeshy.sdk.model.scene.export.StoryExportFrameRate
import me.meeshy.sdk.model.scene.export.StoryExportSize
import me.meeshy.sdk.model.scene.export.StoryExportVideoSettings

/** Où va le fichier baké : la galerie de l'appareil, ou une feuille de partage (miroir de `Destination` iOS). */
public enum class SceneExportDestination { GALLERY, SHARE }

/**
 * L'état de l'export de la scène (miroir de `ComposerSceneExportController` iOS) : repos, bake en cours (fraction
 * `0…1`), fichier prêt à partir, échec.
 */
public sealed interface SceneExportState {
    public data object Idle : SceneExportState
    public data class Running(val fraction: Float, val destination: SceneExportDestination) : SceneExportState
    public data class Ready(val path: String, val destination: SceneExportDestination) : SceneExportState
    public data object Saved : SceneExportState
    public data object Failed : SceneExportState

    public val isExporting: Boolean get() = this is Running

    /** `null` ⇒ aucun voile ; sinon la fraction bakée. */
    public val veilFraction: Float? get() = (this as? Running)?.fraction
}

public object SceneExportReducer {

    /** Un seul export à la fois : le second appel est IGNORÉ, jamais mis en file (l'auteur qui retape veut le même résultat). */
    public fun start(state: SceneExportState, destination: SceneExportDestination): SceneExportState =
        if (state is SceneExportState.Running) state else SceneExportState.Running(0f, destination)

    /** Monotone et bornée ; une valeur tardive ou non finie n'a aucun effet. */
    public fun progress(state: SceneExportState, fraction: Float): SceneExportState {
        if (state !is SceneExportState.Running || !fraction.isFinite()) return state
        return state.copy(fraction = maxOf(state.fraction, fraction.coerceIn(0f, 1f)))
    }

    public fun completed(state: SceneExportState, path: String): SceneExportState =
        (state as? SceneExportState.Running)?.let { SceneExportState.Ready(path, it.destination) } ?: state

    public fun failed(state: SceneExportState): SceneExportState =
        if (state is SceneExportState.Running) SceneExportState.Failed else state

    /** La copie en galerie est faite : le temporaire n'a plus de lecteur. */
    public fun saved(state: SceneExportState): SceneExportState =
        if (state is SceneExportState.Running) SceneExportState.Saved else state

    /** L'écran a dit le résultat (toast) : retour au repos, jamais avant. */
    public fun acknowledged(state: SceneExportState): SceneExportState =
        if (state is SceneExportState.Saved || state is SceneExportState.Failed) SceneExportState.Idle else state

    public fun cancel(state: SceneExportState): SceneExportState = SceneExportState.Idle

    /** Le fichier temporaire que personne ne reprendra : celui qu'un état prêt tient encore. */
    public fun leftoverFile(state: SceneExportState): String? = (state as? SceneExportState.Ready)?.path
}

/** Ce que le bake produit : taille, cadence, durée, débit — repris des réglages uniques de l'export de story. */
public data class SceneExportPlan(
    val width: Int,
    val height: Int,
    val fps: Int,
    val durationMillis: Long,
    val bitRate: Int,
) {
    public val size: StoryExportSize get() = StoryExportSize(width, height)

    public companion object {
        public const val MIN_DURATION_MILLIS: Long = 1_000L
        public const val MAX_DURATION_MILLIS: Long = 60_000L

        public fun of(durationSeconds: Double, landscape: Boolean = false): SceneExportPlan {
            val size = StoryExportVideoSettings.outputSize(landscape)
            val millis = if (durationSeconds.isFinite()) Math.round(durationSeconds * 1000) else 0L
            return SceneExportPlan(
                width = size.width,
                height = size.height,
                fps = StoryExportFrameRate.FPS,
                durationMillis = millis.coerceIn(MIN_DURATION_MILLIS, MAX_DURATION_MILLIS),
                bitRate = StoryExportVideoSettings.averageBitRate(size),
            )
        }

        /** Un nom neutre : ni auteur, ni lieu, ni titre de la scène. */
        public fun fileName(epochMillis: Long): String = "meeshy-scene-$epochMillis.mp4"
    }
}
