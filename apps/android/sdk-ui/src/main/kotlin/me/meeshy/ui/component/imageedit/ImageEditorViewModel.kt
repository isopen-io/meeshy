package me.meeshy.ui.component.imageedit

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlin.math.max
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageAdjustments
import me.meeshy.sdk.model.imageedit.ImageEditHistoryStep
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageEditorCompare
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.sdk.model.imageedit.ImageEditorSession
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/** Le rendu de pixels de l'éditeur, derrière une couture : le moteur réel en production, un faux en test. */
public interface ImageEditorRenderer {
    public fun render(source: Bitmap, state: ImageEditState, instanceId: String?, referenceLongSide: Int): Bitmap
    public fun geometry(source: Bitmap, state: ImageEditState, applyCrop: Boolean): Bitmap
    public fun thumbnails(source: Bitmap): Map<ImageFilter, Bitmap>
    public fun downscaled(source: Bitmap, maxPixel: Int): Bitmap
}

/** Le rendu de production : `ImageFilterEngine`, sans état d'édition. */
public class EngineImageEditorRenderer(private val engine: ImageFilterEngine = ImageFilterEngine()) : ImageEditorRenderer {
    override fun render(source: Bitmap, state: ImageEditState, instanceId: String?, referenceLongSide: Int): Bitmap =
        engine.render(source, state, instanceId, referenceLongSide)

    override fun geometry(source: Bitmap, state: ImageEditState, applyCrop: Boolean): Bitmap =
        engine.renderGeometryOnly(source, state, applyCrop)

    override fun thumbnails(source: Bitmap): Map<ImageFilter, Bitmap> = engine.filterThumbnails(source)

    override fun downscaled(source: Bitmap, maxPixel: Int): Bitmap = engine.downscaled(source, maxPixel)
}

/** Les libellés des pas d'historique, résolus par l'écran (le ViewModel n'a pas de ressources). */
public interface ImageEditorLabels {
    public val reset: String
    public val resetAdjust: String
    public val rotation: String
    public val flip: String
    public val cropApplied: String
    public fun filter(filter: ImageFilter): String
    public fun effect(effect: ImageEffect): String
    public fun adjustment(kind: AdjustmentKind): String
}

/** Où la densité Simple/Pro survit d'une ouverture à l'autre (iOS : `UserDefaults`). */
public interface ImageEditorModeStore {
    public fun load(): ImageEditorMode
    public fun save(mode: ImageEditorMode)
}

public class SharedPreferencesImageEditorModeStore(context: Context) : ImageEditorModeStore {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun load(): ImageEditorMode =
        runCatching { ImageEditorMode.valueOf(prefs.getString(KEY, null) ?: "") }.getOrDefault(ImageEditorMode.SIMPLE)

    override fun save(mode: ImageEditorMode) {
        prefs.edit().putString(KEY, mode.name).apply()
    }

    private companion object {
        const val FILE = "meeshy_image_editor"
        const val KEY = "mode"
    }
}

@Immutable
public data class ImageEditorUiState(
    val session: ImageEditorSession = ImageEditorSession(),
    val preview: Bitmap,
    val filterThumbnails: Map<ImageFilter, Bitmap> = emptyMap(),
    /** Le « avant » tenu pendant l'appui long ; `null` hors comparaison. */
    val comparison: Bitmap? = null,
) {
    val state: ImageEditState get() = session.live
    val mode: ImageEditorMode get() = session.mode
    val activeTool: EditorTool? get() = session.activeTool
    val hasEdits: Boolean get() = session.hasEdits
    val canUndo: Boolean get() = session.canUndo
    val canRedo: Boolean get() = session.canRedo
    val showHistory: Boolean get() = session.showHistory
    val isComparing: Boolean get() = comparison != null
    val displayed: Bitmap get() = comparison ?: preview
    val historySteps: List<ImageEditHistoryStep> get() = session.history.steps
    val currentStepId: Long get() = session.history.currentStepId
}

public sealed interface ImageEditorUiEvent {
    public data class SelectMode(val mode: ImageEditorMode) : ImageEditorUiEvent
    public data class SelectTool(val tool: EditorTool) : ImageEditorUiEvent
    public data object CloseTool : ImageEditorUiEvent
    public data class SelectFilter(val filter: ImageFilter) : ImageEditorUiEvent
    public data class ToggleEffect(val effect: ImageEffect) : ImageEditorUiEvent
    public data class SetAdjustment(val kind: AdjustmentKind, val value: Float) : ImageEditorUiEvent
    public data class CommitAdjustment(val kind: AdjustmentKind) : ImageEditorUiEvent
    public data object ResetAdjustments : ImageEditorUiEvent
    public data class Rotate(val clockwise: Boolean) : ImageEditorUiEvent
    public data class Flip(val horizontal: Boolean) : ImageEditorUiEvent
    public data class BakeCrop(val crop: NormalizedCrop?) : ImageEditorUiEvent
    public data object Undo : ImageEditorUiEvent
    public data object Redo : ImageEditorUiEvent
    public data class Jump(val stepId: Long) : ImageEditorUiEvent
    public data class ShowHistory(val shown: Boolean) : ImageEditorUiEvent
    public data object BeginCompare : ImageEditorUiEvent
    public data object EndCompare : ImageEditorUiEvent
    public data object LoadFilterThumbnails : ImageEditorUiEvent
    public data object Finish : ImageEditorUiEvent
    public data object Cancel : ImageEditorUiEvent
}

public sealed interface ImageEditorUiEffect {
    /** Le rendu final, produit UNE fois depuis l'original intact. */
    public data class Accepted(val image: Bitmap) : ImageEditorUiEffect
    public data object Cancelled : ImageEditorUiEffect
}

/**
 * L'état de l'éditeur d'image, son historique et sa boucle de rendu. Miroir d'iOS
 * `ImageEditorViewModel` : l'[original] n'est jamais muté ni copié ; une copie réduite
 * ([working]) nourrit chaque aperçu, et la pleine résolution n'est rendue qu'une fois, sur
 * [ImageEditorUiEvent.Finish]. L'aperçu et les vignettes se rendent hors du fil principal,
 * sans délai : un rendu en vol, le dernier réglage l'emporte ([LatestWinsRenderLoop]).
 */
public class ImageEditorViewModel(
    private val original: Bitmap,
    public val context: ImageEditorContext,
    private val labels: ImageEditorLabels,
    private val renderer: ImageEditorRenderer = EngineImageEditorRenderer(),
    private val modeStore: ImageEditorModeStore? = null,
    private val renderDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val working: Bitmap = renderer.downscaled(original, WORKING_MAX_PIXEL)
    private val referenceLongSide: Int = max(original.width, original.height)
    private var exported = false

    private val _uiState = MutableStateFlow(
        ImageEditorUiState(
            session = ImageEditorSession(mode = modeStore?.load() ?: ImageEditorMode.SIMPLE),
            preview = working,
        ),
    )
    public val uiState: StateFlow<ImageEditorUiState> = _uiState.asStateFlow()

    private val effects = Channel<ImageEditorUiEffect>(Channel.BUFFERED)
    public val uiEffects: Flow<ImageEditorUiEffect> = effects.receiveAsFlow()

    private val previewLoop = LatestWinsRenderLoop<ImageEditState, Bitmap>(
        scope = viewModelScope,
        renderDispatcher = renderDispatcher,
        render = { state -> renderer.render(working, state, PREVIEW_INSTANCE, referenceLongSide) },
        deliver = { _, rendered -> _uiState.update { it.copy(preview = rendered) } },
    )

    private val thumbnailsLoop = LatestWinsRenderLoop<ImageEditState, Map<ImageFilter, Bitmap>>(
        scope = viewModelScope,
        renderDispatcher = renderDispatcher,
        render = { state -> renderer.thumbnails(renderer.geometry(working, state, applyCrop = true)) },
        deliver = { _, thumbs -> _uiState.update { it.copy(filterThumbnails = thumbs) } },
    )

    /** Oriented, uncropped, colour-free : le fond sur lequel l'outil de recadrage dessine son cadre. */
    public fun cropBackdrop(): Bitmap = renderer.geometry(working, _uiState.value.state, applyCrop = false)

    /** La copie réduite, avant tout rendu : repli du fond de recadrage. */
    public val workingImage: Bitmap get() = working

    public fun onEvent(event: ImageEditorUiEvent) {
        when (event) {
            is ImageEditorUiEvent.SelectMode -> selectMode(event.mode)
            is ImageEditorUiEvent.SelectTool -> selectTool(event.tool)
            ImageEditorUiEvent.CloseTool -> edit(render = false) { it.withToolClosed() }
            is ImageEditorUiEvent.SelectFilter ->
                edit { it.perform(labels.filter(event.filter)) { s -> s.copy(filter = event.filter) } }
            is ImageEditorUiEvent.ToggleEffect -> edit {
                it.perform(labels.effect(event.effect)) { s ->
                    s.copy(effect = if (s.effect == event.effect) ImageEffect.NONE else event.effect)
                }
            }
            is ImageEditorUiEvent.SetAdjustment ->
                edit { it.update { s -> s.copy(adjustments = s.adjustments.with(event.kind, event.value)) } }
            is ImageEditorUiEvent.CommitAdjustment -> edit(render = false) { it.commit(labels.adjustment(event.kind)) }
            ImageEditorUiEvent.ResetAdjustments -> edit {
                it.perform(labels.resetAdjust) { s -> s.copy(adjustments = ImageAdjustments.NEUTRAL) }
            }
            is ImageEditorUiEvent.Rotate -> edit {
                it.perform(labels.rotation) { s -> if (event.clockwise) s.rotatedClockwise() else s.rotatedCounterClockwise() }
            }
            is ImageEditorUiEvent.Flip -> edit {
                it.perform(labels.flip) { s -> if (event.horizontal) s.flippedHorizontally() else s.flippedVertically() }
            }
            is ImageEditorUiEvent.BakeCrop -> edit { it.perform(labels.cropApplied) { s -> s.copy(crop = event.crop) } }
            ImageEditorUiEvent.Undo -> edit { it.undo() }
            ImageEditorUiEvent.Redo -> edit { it.redo() }
            is ImageEditorUiEvent.Jump -> edit { it.jump(event.stepId) }
            is ImageEditorUiEvent.ShowHistory -> edit(render = false) { it.withHistoryShown(event.shown) }
            ImageEditorUiEvent.BeginCompare -> beginCompare()
            ImageEditorUiEvent.EndCompare -> _uiState.update { it.copy(comparison = null) }
            ImageEditorUiEvent.LoadFilterThumbnails -> thumbnailsLoop.submit(_uiState.value.state)
            ImageEditorUiEvent.Finish -> finish()
            ImageEditorUiEvent.Cancel -> effects.trySend(ImageEditorUiEffect.Cancelled)
        }
    }

    private fun edit(render: Boolean = true, transform: (ImageEditorSession) -> ImageEditorSession) {
        var changed = false
        _uiState.update { ui ->
            val next = transform(ui.session)
            changed = next.live != ui.session.live
            if (next == ui.session) ui else ui.copy(session = next)
        }
        if (render && changed) previewLoop.submit(_uiState.value.state)
    }

    private fun selectMode(mode: ImageEditorMode) {
        if (mode == _uiState.value.mode) return
        modeStore?.save(mode)
        edit(render = false) { it.withMode(mode) }
    }

    private fun selectTool(tool: EditorTool) {
        edit(render = false) { it.withTool(tool) }
        if (_uiState.value.activeTool == EditorTool.FILTERS) thumbnailsLoop.submit(_uiState.value.state)
    }

    private fun beginCompare() {
        val ui = _uiState.value
        if (!ImageEditorCompare.canBegin(ui.hasEdits)) return
        val before = renderer.geometry(working, ui.state, applyCrop = true)
        _uiState.update { it.copy(comparison = before) }
    }

    private fun finish() {
        if (exported) return
        exported = true
        val state = _uiState.value.state
        viewModelScope.launch {
            val image = withContext(renderDispatcher) { renderer.render(original, state, null, referenceLongSide) }
            effects.trySend(ImageEditorUiEffect.Accepted(image))
        }
    }

    private companion object {
        const val WORKING_MAX_PIXEL = 2400
        const val PREVIEW_INSTANCE = "image-editor-preview"
    }
}
