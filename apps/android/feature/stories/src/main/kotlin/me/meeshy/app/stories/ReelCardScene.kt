package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntOffset
import androidx.hilt.navigation.compose.hiltViewModel
import kotlin.math.roundToInt
import me.meeshy.sdk.model.StoryItem

/**
 * La loi de cadrage de la scène d'un réel (iOS `ReelCardSceneBackdrop` : `.aspectRatio(SceneShape.aspect, contentMode: .fill)`) : la
 * scène garde son 9:16 et COUVRE le cadre de la carte, rognée au centre — jamais une bande 9:16 centrée qui laisse des marges.
 */
internal object SceneAspectFill {

    data class Size(val width: Float, val height: Float)

    /** Le cadre de la carte, en pixels entiers. */
    data class Host(val width: Int, val height: Int)

    private const val ASPECT = 9f / 16f

    fun cover(width: Float, height: Float): Size {
        if (width <= 0f || height <= 0f) return Size(0f, 0f)
        return if (width / height >= ASPECT) Size(width, width / ASPECT) else Size(height * ASPECT, height)
    }

    /**
     * Le cadre que la carte reçoit : les bornes du parent, sauf une hauteur non bornée (carte dans un défilement) qui prend la
     * hauteur du 9:16 à sa largeur — une largeur non bornée ne donne aucune carte, jamais une taille infinie.
     */
    fun host(maxWidth: Int, maxHeight: Int): Host {
        if (maxWidth == Constraints.Infinity) return Host(0, if (maxHeight == Constraints.Infinity) 0 else maxHeight)
        if (maxHeight != Constraints.Infinity) return Host(maxWidth, maxHeight)
        return Host(maxWidth, (maxWidth / ASPECT).roundToInt())
    }
}

/**
 * Le cadre d'une scène de réel : l'hôte reçoit la taille de [SceneAspectFill.host], [content] est mesuré à la taille qui COUVRE cet
 * hôte et posé au centre, le débord rogné. Une mise en page simple, sans sous-composition par carte.
 */
@Composable
internal fun ReelCardSceneFrame(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Layout(content = content, modifier = modifier.clipToBounds()) { measurables, constraints ->
        val host = SceneAspectFill.host(constraints.maxWidth, constraints.maxHeight)
        val width = host.width.coerceIn(constraints.minWidth, constraints.maxWidth)
        val height = host.height.coerceIn(constraints.minHeight, constraints.maxHeight)
        val scene = SceneAspectFill.cover(width.toFloat(), height.toFloat())
        val sceneWidth = scene.width.roundToInt()
        val sceneHeight = scene.height.roundToInt()
        val placeables = measurables.map { it.measure(Constraints.fixed(sceneWidth, sceneHeight)) }
        layout(width, height) {
            placeables.forEach { it.place(IntOffset((width - sceneWidth) / 2, (height - sceneHeight) / 2)) }
        }
    }
}

/**
 * La scène d'un réel composé sur sa carte (iOS `ReelCardSceneBackdrop`) : la même projection et le même lecteur que le lecteur de
 * stories, mais la scène REMPLIT le cadre reçu (sur du noir, rognée au centre), sans geste ni libellé — la carte qui la porte
 * ouvre le réel et se lit « Réel de … ». Muette dans le fil ; la fiche d'un post la fait entendre tant que [muted] ne la coupe pas. Elle ne joue que quand le fil l'élit ([live]) ; sinon c'est une image fixe, sans lecteur (#13663).
 */
@Composable
fun ReelCardScene(
    item: StoryItem,
    accentHex: String?,
    live: Boolean,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    floor: SceneFloor = SceneFloor.BLACK,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    val slide = remember(item, accentHex) { viewModel.slideOf(item, accentHex = accentHex ?: SCENE_FALLBACK_ACCENT) }
    ReelCardSceneFrame(modifier.background(Color.Black).clearAndSetSemantics { }) {
        StoryScenePlayer(
            slide = slide,
            playing = live,
            muted = muted,
            loads = true,
            rewindWhenIdle = false,
            resting = !live,
            floor = floor,
        )
    }
}

/**
 * La scène d'un post, sur sa carte du fil et dans sa fiche (#14223) : le cadre d'un réel, le sol d'une story. Une scène qui ne
 * déclare aucun fond se lit sur le dégradé de son auteur — celui que le compositeur montrait, et que la story publiée du même
 * geste montre — jamais sur le noir d'un réel.
 */
@Composable
fun PostSceneCard(
    item: StoryItem,
    accentHex: String?,
    live: Boolean,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    ReelCardScene(item, accentHex, live, modifier, muted = muted, floor = SceneFloor.AUTHOR_GRADIENT, viewModel = viewModel)
}

private const val SCENE_FALLBACK_ACCENT = "6366F1"
