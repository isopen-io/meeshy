package me.meeshy.ui.component.imageedit

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsIgnoringVisibility
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.imageedit.ImageEditorGeometry
import me.meeshy.sdk.model.imageedit.ImageEditorInspection
import me.meeshy.ui.R
import me.meeshy.ui.component.imageedit.ImageEditorUiEvent as Event
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/**
 * L'éditeur d'image unique, immersif et plein écran, appelé partout (profil, post, story,
 * message, communauté). Canevas plein cadre sans panneau fixe ; barre haute en verre ; grappes
 * de FAB aux coins ; un contrôleur ne monte que pour l'outil actif. Le rendu final n'est produit
 * qu'une fois, sur « Terminé » ([onAccept]). Miroir d'iOS `MeeshyImageEditorView`.
 *
 * [accent] est passé en paramètre (jamais codé en dur) : l'hôte donne l'accent de son contexte.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun MeeshyImageEditorScreen(
    image: Bitmap,
    context: ImageEditorContext,
    onAccept: (Bitmap) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
    viewModel: ImageEditorViewModel = rememberImageEditorViewModel(image, context),
) {
    val ui by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val crop = rememberImageEditorCrop(viewModel, context.initialCropRatio)
    val acceptCallback by androidx.compose.runtime.rememberUpdatedState(onAccept)
    val cancelCallback by androidx.compose.runtime.rememberUpdatedState(onCancel)

    LaunchedEffect(viewModel) {
        viewModel.uiEffects.collect { effect ->
            when (effect) {
                is ImageEditorUiEffect.Accepted -> { haptics.success(); acceptCallback(effect.image) }
                ImageEditorUiEffect.Cancelled -> cancelCallback()
            }
        }
    }
    LaunchedEffect(viewModel) { viewModel.onEvent(Event.LoadFilterThumbnails) }
    ImageEditorImmersiveEffect()
    BackHandler {
        when {
            ui.showHistory -> viewModel.onEvent(Event.ShowHistory(false))
            ui.activeTool != null -> { crop.bake(); viewModel.onEvent(Event.CloseTool) }
            else -> viewModel.onEvent(Event.Cancel)
        }
    }

    val insets = WindowInsets.systemBarsIgnoringVisibility.union(WindowInsets.displayCutout)
    val density = LocalDensity.current
    val safeTop = with(density) { insets.getTop(density).toDp() }
    val safeBottom = with(density) { insets.getBottom(density).toDp() }

    Box(modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary).testTag("image-editor")) {
        ImageEditorCanvas(viewModel, ui, crop, safeTop, safeBottom)
        ImageEditorTopBar(
            mode = ui.mode,
            accent = accent,
            onCancel = { viewModel.onEvent(Event.Cancel) },
            onMode = { viewModel.onEvent(Event.SelectMode(it)) },
            onDone = { crop.bake(); viewModel.onEvent(Event.Finish) },
            modifier = Modifier.padding(top = safeTop),
        )
        val controllerOpen = ui.activeTool != null
        ImageEditorToolFabs(
            visible = !controllerOpen,
            mode = ui.mode,
            accent = accent,
            onTool = { crop.select(it) },
            modifier = Modifier.align(Alignment.BottomStart).padding(start = MeeshySpacing.lg, bottom = 22.dp + safeBottom),
        )
        ImageEditorHistoryFabs(
            visible = !controllerOpen,
            hasEdits = ui.hasEdits,
            canUndo = ui.canUndo,
            canRedo = ui.canRedo,
            accent = accent,
            onHistory = { viewModel.onEvent(Event.ShowHistory(true)) },
            onUndo = { viewModel.onEvent(Event.Undo) },
            onRedo = { viewModel.onEvent(Event.Redo) },
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = MeeshySpacing.lg, bottom = 22.dp + safeBottom),
        )
        ImageEditorController(
            tool = ui.activeTool,
            mode = ui.mode,
            canUndo = ui.canUndo,
            canRedo = ui.canRedo,
            accent = accent,
            onTool = { crop.select(it) },
            onUndo = { viewModel.onEvent(Event.Undo) },
            onRedo = { viewModel.onEvent(Event.Redo) },
            onClose = { crop.bake(); viewModel.onEvent(Event.CloseTool) },
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = safeBottom),
        ) { tool -> ToolContent(tool, viewModel, ui, crop, accent) }
        AnimatedVisibility(ui.showHistory, enter = fadeIn(), exit = fadeOut()) {
            ImageEditorHistoryOverlay(
                steps = ui.historySteps,
                currentStepId = ui.currentStepId,
                accent = accent,
                onJump = { viewModel.onEvent(Event.Jump(it)) },
                onClose = { viewModel.onEvent(Event.ShowHistory(false)) },
            )
        }
    }
}

@Composable
private fun ToolContent(tool: EditorTool, vm: ImageEditorViewModel, ui: ImageEditorUiState, crop: ImageEditorCropController, accent: Color) {
    when (tool) {
        EditorTool.CROP -> ImageEditorCropPanel(
            mode = ui.mode,
            ratio = crop.ratio,
            accent = accent,
            onRatio = { crop.chooseRatio(it) },
            onRotate = { crop.rotate(it) },
            onFlip = { crop.flip(it) },
        )
        EditorTool.FILTERS -> ImageEditorFiltersPanel(
            mode = ui.mode,
            selected = ui.state.filter,
            thumbnails = ui.filterThumbnails,
            accent = accent,
            onSelect = { vm.onEvent(Event.SelectFilter(it)) },
        )
        EditorTool.ADJUST -> ImageEditorAdjustPanel(
            mode = ui.mode,
            adjustments = ui.state.adjustments,
            accent = accent,
            onChange = { kind: AdjustmentKind, value -> vm.onEvent(Event.SetAdjustment(kind, value)) },
            onCommit = { vm.onEvent(Event.CommitAdjustment(it)) },
            onReset = { vm.onEvent(Event.ResetAdjustments) },
        )
        EditorTool.EFFECTS -> ImageEditorEffectsPanel(
            selected = ui.state.effect,
            accent = accent,
            onToggle = { effect: ImageEffect -> vm.onEvent(Event.ToggleEffect(effect)) },
        )
    }
}

/** Le canevas : l'image plein cadre (zoom, déplacement, comparaison) ou le cadre de recadrage. */
@Composable
private fun ImageEditorCanvas(
    vm: ImageEditorViewModel,
    ui: ImageEditorUiState,
    crop: ImageEditorCropController,
    safeTop: androidx.compose.ui.unit.Dp,
    safeBottom: androidx.compose.ui.unit.Dp,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val controllerOpen = ui.activeTool != null
        val top = safeTop + 60.dp
        val height = ImageEditorGeometry.canvasHeight(
            windowHeight = maxHeight.value,
            controllerOpen = controllerOpen,
            topInset = top.value,
            fabInset = 92f + safeBottom.value,
        ).dp
        Box(Modifier.offset(y = top).fillMaxWidth().height(height)) {
            if (ui.activeTool == EditorTool.CROP) {
                ImageEditorCropCanvas(crop)
            } else {
                ImageEditorImageCanvas(ui, vm)
            }
        }
    }
}

@Composable
private fun ImageEditorImageCanvas(ui: ImageEditorUiState, vm: ImageEditorViewModel) {
    var inspection by remember { mutableStateOf(ImageEditorInspection.IDENTITY) }
    LaunchedEffect(ui.session.history.currentStepId) { inspection = ImageEditorInspection.IDENTITY }
    val shown = remember(ui.displayed) { ui.displayed.asImageBitmap() }
    val before = stringResource(R.string.image_editor_before)
    Box(
        Modifier
            .fillMaxSize()
            .imageEditorCompareGesture(
                enabled = ui.hasEdits,
                onBegin = { vm.onEvent(Event.BeginCompare) },
                onEnd = { vm.onEvent(Event.EndCompare) },
            )
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { inspection = inspection.doubleTapped() }) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val zoom = event.calculateZoom()
                        val pan = event.calculatePan()
                        val multi = event.changes.size > 1
                        if (multi || inspection.isZoomed) {
                            inspection = inspection.pinched(inspection.zoom, zoom).panned(pan.x, pan.y)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    inspection = inspection.settled()
                }
            }
            .testTag("image-editor-canvas"),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = shown,
            contentDescription = if (ui.isComparing) before else null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = MeeshySpacing.mdPlus)
                .graphicsLayer {
                    scaleX = inspection.zoom
                    scaleY = inspection.zoom
                    translationX = inspection.panX
                    translationY = inspection.panY
                },
        )
        AnimatedVisibility(ui.isComparing, Modifier.align(Alignment.TopCenter), enter = fadeIn(), exit = fadeOut()) {
            Text(
                before,
                color = Color.White,
                style = meeshyText(MeeshyFontSize.footnote, FontWeight.Bold),
                modifier = Modifier
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus)
                    .semantics { contentDescription = before }
                    .testTag("image-editor-before-badge"),
            )
        }
    }
}

/** Mode immersif : la barre d'état se cache et revient à la fermeture ; le chrome se pose dans les marges réelles de la fenêtre. */
@Composable
private fun ImageEditorImmersiveEffect() {
    val context = LocalContext.current
    DisposableEffect(context) {
        val window = context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, it.decorView) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.statusBars())
        onDispose { controller?.show(WindowInsetsCompat.Type.statusBars()) }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Le ViewModel de l'éditeur, tenu dans un magasin PROPRE à cette ouverture : il naît avec la photo
 * et meurt à la fermeture. Sans cela, `viewModel()` le rangerait dans le magasin de l'hôte (l'écran
 * de profil) et rouvrirait l'éditeur — pour la bannière après l'avatar — sur la photo précédente.
 */
@Composable
public fun rememberImageEditorViewModel(image: Bitmap, context: ImageEditorContext): ImageEditorViewModel {
    val app = LocalContext.current.applicationContext
    val store = remember(image) { ViewModelStore() }
    DisposableEffect(store) { onDispose { store.clear() } }
    val owner = remember(store) {
        object : ViewModelStoreOwner {
            override val viewModelStore: ViewModelStore = store
        }
    }
    return viewModel<ImageEditorViewModel>(
        viewModelStoreOwner = owner,
        factory = viewModelFactory {
            initializer {
                ImageEditorViewModel(
                    original = image,
                    context = context,
                    labels = ResourceImageEditorLabels(app),
                    modeStore = SharedPreferencesImageEditorModeStore(app),
                )
            }
        },
    )
}
