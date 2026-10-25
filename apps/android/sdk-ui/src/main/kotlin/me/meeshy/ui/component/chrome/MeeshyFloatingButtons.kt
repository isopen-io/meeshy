package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.chrome.FloatingButtonsLayout
import me.meeshy.sdk.model.layout.PointDp
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.layout.currentMeeshyWindowInfo
import me.meeshy.ui.theme.MeeshyMotion
import kotlin.math.roundToInt

/** Diametre d'un bouton flottant — `FloatingButtonGeometry.buttonSize` iOS (52). */
public val FloatingButtonSize: Dp = FloatingButtonGeometry.BUTTON_SIZE.dp

/** Etiquettes de test des deux disques. */
public const val FLOATING_BUTTON_LEFT_TAG: String = "floating-button-left"
public const val FLOATING_BUTTON_RIGHT_TAG: String = "floating-button-right"

/**
 * Ce que TalkBack annonce d'un bouton flottant — miroir de `floatingButtonAccessibility` iOS :
 * un libelle, un indice (lu comme l'action du double-tap), une valeur (etat), et une action
 * nommee qui declenche l'appui long quand [actionName] est fourni.
 */
@Immutable
public data class FloatingButtonSemantics(
    val label: String,
    val hint: String? = null,
    val value: String? = null,
    val actionName: String? = null,
)

/**
 * Les deux boutons flottants, posables a n'importe quelle hauteur contre le bord gauche ou
 * droit — portage de `FreeFloatingButtonsContainer` (FloatingButtons.swift, #9679).
 *
 * Toute la geometrie vient de [FloatingButtonGeometry] (core:model) : la zone sure REELLE de
 * la fenetre ([currentMeeshyWindowInfo] — ce chrome est dessine hors du fournisseur de la
 * navigation), l'ecart minimal du meme cote, et la SEULE ecriture d'une position, a la fin d'un
 * vrai glisser ([FloatingButtonGeometry.storageAfterDrag]).
 *
 * Les valeurs sont BRUTES (`v3,L,0.5` ou l'ancien `x,y`) : le conteneur les lit, ne les
 * reecrit jamais par lui-meme. [behindButtons] est dessine sous les disques (le voile de
 * l'echelle), [aboveButtons] au-dessus (l'echelle elle-meme), tous deux dans le repere de
 * l'ecran. Tant que [LocalScrollMotionActive] est vrai, les disques s'effacent et ne repondent
 * plus.
 */
@Composable
public fun MeeshyFloatingButtons(
    leftStorage: String,
    rightStorage: String,
    onLeftStorageChange: (String) -> Unit,
    onRightStorageChange: (String) -> Unit,
    onLeftTap: () -> Unit,
    onLeftLongPress: () -> Unit,
    onRightTap: () -> Unit,
    onRightLongPress: () -> Unit,
    leftSemantics: FloatingButtonSemantics,
    rightSemantics: FloatingButtonSemantics,
    modifier: Modifier = Modifier,
    behindButtons: @Composable () -> Unit = {},
    aboveButtons: @Composable (geometry: FloatingButtonGeometry, layout: FloatingButtonsLayout) -> Unit = { _, _ -> },
    leftContent: @Composable () -> Unit,
    rightContent: @Composable () -> Unit,
) {
    val safeInsets = currentMeeshyWindowInfo().safeInsets
    val scrolling = LocalScrollMotionActive.current
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val geometry = remember(maxWidth, maxHeight, safeInsets) {
            FloatingButtonGeometry(screenWidth = maxWidth.value, screenHeight = maxHeight.value, safeInsets = safeInsets)
        }
        // La valeur ecrite a la levee du doigt, tenue le temps que le magasin la renvoie : sans
        // elle, le disque reviendrait a son ancienne place l'espace d'une image avant d'y aller.
        var leftPending by remember { mutableStateOf<String?>(null) }
        var rightPending by remember { mutableStateOf<String?>(null) }
        LaunchedEffect(leftStorage) { leftPending = null }
        LaunchedEffect(rightStorage) { rightPending = null }

        if (geometry.isMeasured) {
            val layout = geometry.layout(leftPending ?: leftStorage, rightPending ?: rightStorage)
            behindButtons()
            FloatingDisc(
                center = layout.feed,
                onDragEnded = { start, dx, dy ->
                    val written = geometry.storageAfterDrag(start, dx, dy, avoiding = layout.menu)
                    if (written == null) {
                        layout.feed
                    } else {
                        leftPending = written
                        onLeftStorageChange(written)
                        geometry.layout(written, rightPending ?: rightStorage).feed
                    }
                },
                onTap = onLeftTap,
                onLongPress = onLeftLongPress,
                a11y = leftSemantics,
                hidden = scrolling,
                testTag = FLOATING_BUTTON_LEFT_TAG,
                content = leftContent,
            )
            FloatingDisc(
                center = layout.menu,
                onDragEnded = { start, dx, dy ->
                    val written = geometry.storageAfterDrag(start, dx, dy, avoiding = layout.feed)
                    if (written == null) {
                        layout.menu
                    } else {
                        rightPending = written
                        onRightStorageChange(written)
                        geometry.layout(leftPending ?: leftStorage, written).menu
                    }
                },
                onTap = onRightTap,
                onLongPress = onRightLongPress,
                a11y = rightSemantics,
                hidden = scrolling,
                testTag = FLOATING_BUTTON_RIGHT_TAG,
                content = rightContent,
            )
            aboveButtons(geometry, layout)
        }
    }
}

/**
 * Un disque pose en [center] (dp, repere de l'ecran). Il suit le doigt image par image ; a la
 * levee, [onDragEnded] recoit le depart et la course et rend le centre ou se poser — le meme
 * si rien n'est ecrit (un toucher), le nouveau sinon — rejoint sur un ressort 0,4 / 0,75.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FloatingDisc(
    center: PointDp,
    onDragEnded: (start: PointDp, dx: Float, dy: Float) -> PointDp,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    a11y: FloatingButtonSemantics,
    hidden: Boolean,
    testTag: String,
    content: @Composable () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    val x = remember { Animatable(center.x) }
    val y = remember { Animatable(center.y) }
    var drag by remember { mutableStateOf(Offset.Zero) }
    var dragging by remember { mutableStateOf(false) }
    var dragStart by remember { mutableStateOf(center) }
    val currentOnDragEnded by rememberUpdatedState(onDragEnded)

    // Un centre qui change hors glisser (rotation, zone sure, repoussement) : ressort 0,35 / 0,8.
    LaunchedEffect(center) {
        launch { x.animateTo(center.x, spring(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f))) }
        launch { y.animateTo(center.y, spring(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f))) }
    }
    val scale by animateFloatAsState(
        targetValue = if (dragging) DRAG_SCALE else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f)),
        label = "floating-disc-drag-scale",
    )
    val alpha by animateFloatAsState(
        targetValue = ScrollMotionVisibility.opacity(hidden),
        animationSpec = tween(ScrollMotionVisibility.FADE_DURATION_MS),
        label = "floating-disc-scroll-fade",
    )
    val half = FloatingButtonGeometry.BUTTON_SIZE / 2f
    val interactionSource = remember { MutableInteractionSource() }
    // Efface en plein glisser (la liste repart) : le geste est detache, le disque revient.
    LaunchedEffect(hidden) {
        if (hidden) {
            drag = Offset.Zero
            dragging = false
        }
    }

    val gestures = if (!ScrollMotionVisibility.allowsHitTesting(hidden)) {
        Modifier
    } else {
        Modifier
            .combinedClickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClickLabel = a11y.hint,
                onLongClickLabel = a11y.actionName,
                onClick = {
                    haptics.light()
                    onTap()
                },
                onLongClick = {
                    haptics.medium()
                    onLongPress()
                },
            )
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = {
                        dragStart = PointDp(x.value, y.value)
                        dragging = true
                    },
                    onDragEnd = {
                        val travelled = drag
                        scope.launch {
                            x.snapTo(x.value + travelled.x)
                            y.snapTo(y.value + travelled.y)
                            drag = Offset.Zero
                            dragging = false
                            val target = currentOnDragEnded(dragStart, travelled.x, travelled.y)
                            haptics.light()
                            val release = spring<Float>(dampingRatio = 0.75f, stiffness = MeeshyMotion.stiffnessForResponse(0.4f))
                            launch { x.animateTo(target.x, release) }
                            launch { y.animateTo(target.y, release) }
                        }
                    },
                    onDragCancel = {
                        drag = Offset.Zero
                        dragging = false
                    },
                ) { change, amount ->
                    change.consume()
                    drag += Offset(amount.x / density, amount.y / density)
                }
            }
    }

    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (x.value + drag.x - half).dp.roundToPx(),
                    y = (y.value + drag.y - half).dp.roundToPx(),
                )
            }
            .size(FloatingButtonSize)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .shadow(elevation = 10.dp, shape = CircleShape, clip = false)
            .border(1.5.dp, DISC_RIM, CircleShape)
            .testTag(testTag)
            .semantics {
                contentDescription = a11y.label
                a11y.value?.let { stateDescription = it }
                a11y.actionName?.let { name ->
                    customActions = listOf(CustomAccessibilityAction(name) { onLongPress(); true })
                }
            }
            .then(gestures),
        contentAlignment = Alignment.Center,
    ) {
        // Le contenu (icone, avatar, pastille) est DESSINE, pas annonce : le disque porte seul
        // son libelle, sa valeur et ses actions (`accessibilityElement(children: .ignore)`).
        Box(Modifier.clearAndSetSemantics { }, contentAlignment = Alignment.Center) { content() }
    }
}

private const val DRAG_SCALE = 1.15f

/** Le liseré du disque : blanc dégradé du haut-gauche au bas-droite (`MeeshyOpacity.medium` -> `subtle`). */
private val DISC_RIM = Brush.linearGradient(listOf(Color.White.copy(alpha = 0.3f), Color.White.copy(alpha = 0.1f)))
