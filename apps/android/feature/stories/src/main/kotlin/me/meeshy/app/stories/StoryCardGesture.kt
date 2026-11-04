package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp

/** Courbe du commit du cube (iOS `StoryGroupCube.commitAnimation`). */
internal val CubeCommitEasing = CubicBezierEasing(0.25f, 0.8f, 0.35f, 1f)
internal const val CUBE_COMMIT_MS = StoryGroupCubeGeometry.COMMIT_MILLIS

/** Amorti critique (iOS `settleAnimation`, réponse 0,3 s) : jamais de dépassement de l'autre côté. */
internal val CubeSettleSpring = spring<Float>(dampingRatio = 1f, stiffness = 438.6f)

/** Retour de la carte tirée vers le bas (iOS `snapDragOffsetBack`, réponse 0,35 s, amorti 0,75). */
internal val DismissSettleSpring = spring<Float>(dampingRatio = 0.75f, stiffness = 322.3f)

/** Sortie de la carte (iOS `dismissViewer`, réponse 0,5 s, amorti 0,82), lecteur fermé à 450 ms. */
internal val DismissExitSpring = spring<Float>(dampingRatio = 0.82f, stiffness = 157.9f)
internal const val DISMISS_CLOSE_DELAY_MS = 450L

/**
 * L'état du geste qui porte la carte du lecteur. Les valeurs animées ne sont lues qu'en
 * phase de dessin ; seul [dragging] est lu par la composition, deux fois par geste, pour
 * figer la lecture tant que le doigt tient la carte (iOS : pause état-dirigée par
 * `gestureAxis != 0`).
 */
@Stable
internal class StoryCardMotion {
    val offsetX = Animatable(0f)
    val dragY = Animatable(0f)
    val dismissal = Animatable(0f)

    /** 0 = carte à 0,92 / coin 24 dp, 1 = plein écran : le lecteur grandit à l'ouverture. */
    val appear = Animatable(0f)
    var dragging by mutableStateOf(false)
    var transitioning = false
    var width = 0f

    /**
     * Les faces des groupes voisins ne sont montées que le temps d'un glissé horizontal (et de son retour) : hors geste,
     * aucun backdrop ni carte d'identité n'existe en mémoire.
     */
    var cubeNeighborsMounted by mutableStateOf(false)

    /** Un commit au doigt a déjà joué le cube : l'entrée « sans glissé » ne le rejoue pas à l'échange de contenu. */
    var entryPlayed = false

    /** Le suivi du glissé et la session plein écran : l'état que la couche de glissé lit et écrit (iOS `drag`). */
    val tracker = StoryReaderDragTracker()
    val fullscreen = StoryFullscreenSession()

    /** Miroir lisible par la composition du jeton de purge du suivi : il redémarre les détecteurs de toucher. */
    var resetToken by mutableIntStateOf(0)
}

@Composable
internal fun rememberStoryCardMotion(): StoryCardMotion = remember { StoryCardMotion() }

private val AppearSpring = spring<Float>(
    dampingRatio = StoryViewerCardTransform.APPEAR_DAMPING,
    stiffness = 246.7f,
)

/** L'ouverture : la carte grandit de 0,92 à 1 en perdant son coin, sans flash (iOS `viewerDidAppear`). */
@Composable
internal fun StoryCardAppearOnOpen(motion: StoryCardMotion) {
    LaunchedEffect(motion) { motion.appear.animateTo(1f, AppearSpring) }
}

/**
 * Un changement d'auteur qui ne vient pas d'un glissé (tap en bord, fin du dernier
 * segment) entre lui aussi en cube, par le côté du sens de lecture.
 */
@Composable
internal fun StoryCubeEntryOnAuthorChange(motion: StoryCardMotion, authorKey: String?, groupIndex: Int) {
    val previous = remember { intArrayOf(-1) }
    LaunchedEffect(authorKey) {
        val before = previous[0]
        previous[0] = groupIndex
        val played = motion.entryPlayed
        motion.entryPlayed = false
        if (before < 0 || before == groupIndex || played || motion.transitioning || motion.width <= 0f) return@LaunchedEffect
        val side = if (groupIndex > before) motion.width else -motion.width
        motion.offsetX.snapTo(side)
        motion.offsetX.animateTo(0f, tween(CUBE_COMMIT_MS, easing = CubeCommitEasing))
    }
}

/** Le cadre de la carte : face de cube, réduction de la fermeture, voile d'ombre. */
internal fun Modifier.storyCardFrame(motion: StoryCardMotion): Modifier = this
    .onSizeChanged { motion.width = it.width.toFloat() }
    .graphicsLayer {
        val width = size.width
        val offset = motion.offsetX.value
        val cube = StoryGroupCubeGeometry.face(offset, width)
        translationX = cube.translationX
        rotationY = cube.rotationYDegrees
        cameraDistance = StoryCubeTransform.cameraDistance(width)
        val frame = StoryViewerCardTransform.frame(
            appear = motion.appear.value,
            dragY = motion.dragY.value,
            dismissal = motion.dismissal.value,
            screenHeight = size.height,
            travelPx = StoryCubeTransform.DISMISS_TRAVEL_DP.dp.toPx(),
        )
        scaleX = frame.scale * cube.scale
        scaleY = frame.scale * cube.scale
        translationY = frame.offsetY
        alpha = if (cube.isFacingViewer) frame.alpha else 0f
        val corner = frame.cornerDp.dp.toPx()
        clip = corner > 0f
        if (clip) shape = RoundedCornerShape(corner)
    }
    .drawWithContent {
        drawContent()
        val shade = StoryCubeTransform.shade(motion.offsetX.value, size.width)
        if (shade > 0f) drawRect(Color.Black, alpha = shade)
    }
