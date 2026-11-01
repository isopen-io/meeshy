package me.meeshy.sdk.model.composer.scene

/** Où va le fichier baké : la galerie de l'appareil, ou une feuille de partage (miroir de `Destination` iOS). */
public enum class SceneExportDestination { GALLERY, SHARE }

/**
 * L'état de l'export de la scène (miroir de `ComposerSceneExportController` iOS) : repos, bake en cours (fraction
 * `0…1`), fichier prêt à partir, échec.
 */
public sealed interface SceneExportState {
    public data object Idle : SceneExportState
    /** [phase] : le rendu, puis la relecture du fichier rendu (#14088) — barre pleine, l'écran dit qu'il vérifie. */
    public data class Running(
        val fraction: Float,
        val destination: SceneExportDestination,
        val phase: SceneExportPhase = SceneExportPhase.RENDERING,
    ) : SceneExportState
    public data class Ready(val path: String, val destination: SceneExportDestination) : SceneExportState
    public data object Saved : SceneExportState
    public data object Failed : SceneExportState

    public val isExporting: Boolean get() = this is Running

    /** Le rendu est fini et se relit avant la remise (#14088). */
    public val isVerifying: Boolean get() = (this as? Running)?.phase == SceneExportPhase.VERIFYING

    /** `null` ⇒ aucun voile ; sinon la fraction bakée. */
    public val veilFraction: Float? get() = (this as? Running)?.fraction
}

/** Les deux temps d'un export qui tourne : le rendu, puis la relecture qui prouve que le fichier montre sa scène (#13986, #14088). */
public enum class SceneExportPhase { RENDERING, VERIFYING }

public object SceneExportReducer {

    /** Un seul export à la fois : le second appel est IGNORÉ, jamais mis en file (l'auteur qui retape veut le même résultat). */
    public fun start(state: SceneExportState, destination: SceneExportDestination): SceneExportState =
        if (state is SceneExportState.Running) state else SceneExportState.Running(0f, destination)

    /** La destination qu'une vue a décidée en cours de préparation (Imager, #14326) remplace celle du lancement. */
    public fun retarget(state: SceneExportState, destination: SceneExportDestination): SceneExportState =
        (state as? SceneExportState.Running)?.copy(destination = destination) ?: state

    /** Monotone et bornée ; une valeur tardive ou non finie n'a aucun effet. */
    public fun progress(state: SceneExportState, fraction: Float): SceneExportState {
        if (state !is SceneExportState.Running || !fraction.isFinite()) return state
        return state.copy(fraction = maxOf(state.fraction, fraction.coerceIn(0f, 1f)))
    }

    /** Le rendu est fini : la barre est pleine et l'écran dit qu'il vérifie le fichier (#14088). */
    public fun verifying(state: SceneExportState): SceneExportState =
        (state as? SceneExportState.Running)?.copy(fraction = 1f, phase = SceneExportPhase.VERIFYING) ?: state

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

/** Le nom et le type des fichiers que l'export remet (galerie, partage). */
public object SceneExportPlan {

    /** Un nom neutre : ni auteur, ni lieu, ni titre de la scène. */
    public fun fileName(epochMillis: Long): String = "meeshy-scene-$epochMillis.mp4"

    /** Une scène fixe et muette sort en IMAGE (#13897, web « scène statique et muette ») : même nom neutre, en JPEG. */
    public fun stillFileName(epochMillis: Long): String = "meeshy-scene-$epochMillis$STILL_EXTENSION"

    /** Le type sous lequel un fichier d'export se remet à la feuille de partage : une image fixe, sinon la vidéo. */
    public fun mimeType(path: String): String =
        if (path.endsWith(STILL_EXTENSION, ignoreCase = true)) STILL_MIME_TYPE else VIDEO_MIME_TYPE

    private const val STILL_EXTENSION = ".jpg"
    private const val STILL_MIME_TYPE = "image/jpeg"
    private const val VIDEO_MIME_TYPE = "video/mp4"
}
