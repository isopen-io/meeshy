package me.meeshy.sdk.model.imageedit

/**
 * L'état pur d'une session d'édition : retouche vivante, historique, mode, outil ouvert et
 * volet d'historique. Valeur immuable ; chaque geste rend une nouvelle session. Miroir de la
 * logique d'état d'iOS `ImageEditorViewModel` + `MeeshyImageEditorView`.
 *
 * `live` bouge à chaque cran d'un curseur sans toucher à l'historique ; [commit] grave un seul
 * pas quand le geste se pose, si bien qu'un glissé continu n'est qu'UN pas d'annulation.
 */
public data class ImageEditorSession(
    val live: ImageEditState = ImageEditState.IDENTITY,
    val history: ImageEditHistory = ImageEditHistory(),
    val mode: ImageEditorMode = ImageEditorMode.SIMPLE,
    val activeTool: EditorTool? = null,
    val showHistory: Boolean = false,
) {
    val hasEdits: Boolean get() = live.hasEdits
    val canUndo: Boolean get() = history.canUndo
    val canRedo: Boolean get() = history.canRedo

    /** Applique [mutation] à la retouche vivante, sans historique. */
    public fun update(mutation: (ImageEditState) -> ImageEditState): ImageEditorSession {
        val next = mutation(live)
        return if (next == live) this else copy(live = next)
    }

    /** Grave la retouche vivante dans l'historique sous [label]. */
    public fun commit(label: String): ImageEditorSession = copy(history = history.record(live, label))

    /** Mutation + gravure, pour un geste discret (choisir un filtre, pivoter, un ratio). */
    public fun perform(label: String, mutation: (ImageEditState) -> ImageEditState): ImageEditorSession =
        update(mutation).commit(label)

    /** Retour à l'identité en un pas d'historique ; sans retouche, rien. */
    public fun reset(label: String): ImageEditorSession =
        if (live.hasEdits) perform(label) { ImageEditState.IDENTITY } else this

    public fun undo(): ImageEditorSession = history.undo()?.let { restored(it) } ?: this

    public fun redo(): ImageEditorSession = history.redo()?.let { restored(it) } ?: this

    public fun jump(stepId: Long): ImageEditorSession = history.jump(stepId)?.let { restored(it) } ?: this

    private fun restored(history: ImageEditHistory): ImageEditorSession =
        copy(history = history, live = history.current)

    /** Change de densité ; repasser en Simple depuis Effets ferme l'outil. */
    public fun withMode(newMode: ImageEditorMode): ImageEditorSession {
        if (newMode == mode) return this
        val closes = !newMode.isPro && activeTool?.isEssential == false
        return copy(mode = newMode, activeTool = if (closes) null else activeTool)
    }

    /** Ouvre [tool], ou ferme le contrôleur si c'est déjà l'outil ouvert. Un outil hors du rail du mode est refusé. */
    public fun withTool(tool: EditorTool): ImageEditorSession = when {
        tool !in EditorTool.rail(mode) -> this
        activeTool == tool -> copy(activeTool = null)
        else -> copy(activeTool = tool)
    }

    public fun withToolClosed(): ImageEditorSession = if (activeTool == null) this else copy(activeTool = null)

    public fun withHistoryShown(shown: Boolean): ImageEditorSession =
        if (showHistory == shown) this else copy(showHistory = shown)
}
