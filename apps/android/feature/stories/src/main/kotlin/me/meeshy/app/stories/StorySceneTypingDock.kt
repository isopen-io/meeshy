package me.meeshy.app.stories

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imeAnimationTarget
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Options
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Surface

/** Le clavier tel que l'état de frappe le lit, en dp au-dessus des barres système : ce qu'il occupe, et où il va. */
internal interface TypingKeyboard {
    fun bottom(density: Density): Float
    fun target(density: Density): Float
}

/**
 * L'état de frappe (#13835) tel que la disposition le pose : la barre de style collée au clavier, et sous elle — à la
 * place du clavier — les choix d'une icône quand [surface] les montre. [onKeyboardRaised] : le clavier remonte (l'auteur a
 * touché son texte), les choix se ferment. [keyboard] nul : celui de la fenêtre.
 */
internal class StoryTypingSlot(
    val surface: Surface,
    val bar: @Composable () -> Unit,
    val options: @Composable (Options) -> Unit,
    val onKeyboardRaised: () -> Unit,
    val keyboard: TypingKeyboard? = null,
)

/** Le clavier de la fenêtre : l'encart IME, moins la barre de navigation que la disposition a déjà déduite. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun rememberWindowTypingKeyboard(): TypingKeyboard {
    val ime = WindowInsets.ime.exclude(WindowInsets.navigationBars)
    val target = WindowInsets.imeAnimationTarget.exclude(WindowInsets.navigationBars)
    return remember(ime, target) {
        object : TypingKeyboard {
            override fun bottom(density: Density): Float = ime.getBottom(density) / density.density
            override fun target(density: Density): Float = target.getBottom(density) / density.density
        }
    }
}

/**
 * Ce que l'état de frappe mesure et retient pendant la vie du compositeur : la hauteur du dernier clavier posé (celle que
 * prendront les choix) et celle de la barre peinte. Lues dans les phases de placement et de dessin seulement : le clavier
 * qui glisse ne recompose rien.
 */
internal class TypingMeasures(val lastKeyboard: MutableFloatState, val barHeight: MutableFloatState)

/** La place réservée sous la barre, en dp, à l'instant où on la lit. */
private fun TypingMeasures.reserve(slot: StoryTypingSlot, keyboard: TypingKeyboard, density: Density, windowHeight: Float): Float =
    ComposerKeyboardOrOptions.reserve(
        surface = slot.surface,
        ime = keyboard.bottom(density),
        imeTarget = keyboard.target(density),
        lastKeyboard = lastKeyboard.floatValue,
        windowHeight = windowHeight,
    )

/**
 * La scène pendant la frappe : le plus grand 9:16 entier au-dessus de la barre, centré — l'échelle et le décalage suivent
 * le clavier image par image dans le `graphicsLayer`, sans relayout ni recomposition des objets de la scène.
 */
internal fun Modifier.typingScene(
    slot: StoryTypingSlot,
    keyboard: TypingKeyboard,
    measures: TypingMeasures,
    frame: () -> Pair<Float, Float>,
    windowHeight: Float,
): Modifier = fillMaxSize().graphicsLayer {
    val (width, height) = frame()
    val box = ComposerKeyboardOrOptions.scene(
        frameWidth = width / density,
        frameHeight = height / density,
        windowHeight = windowHeight,
        reserve = measures.reserve(slot, keyboard, this, windowHeight),
        barHeight = measures.barHeight.floatValue,
    )
    scaleX = box.framing.scale
    scaleY = box.framing.scale
    translationY = box.framing.offsetY * density
}

/** La barre collée au clavier et, quand une icône est ouverte, ses choix dessous, à la hauteur du dernier clavier. */
@Composable
internal fun BoxScope.TypingDock(slot: StoryTypingSlot, keyboard: TypingKeyboard, measures: TypingMeasures, windowHeight: Float) {
    val density = LocalDensity.current
    Column(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .offset {
                val lift = if (slot.surface is Surface.Showing) 0f else measures.reserve(slot, keyboard, this, windowHeight)
                IntOffset(0, -(lift * density.density).roundToInt())
            },
    ) {
        Box(Modifier.fillMaxWidth().onSizeChanged { measures.barHeight.floatValue = it.height / density.density }) { slot.bar() }
        (slot.surface as? Surface.Showing)?.let { showing ->
            Box(
                modifier = Modifier.fillMaxWidth().layout { measurable, constraints ->
                    val height = (measures.reserve(slot, keyboard, this, windowHeight) * density.density).roundToInt()
                    val placeable = measurable.measure(constraints.copy(minHeight = height, maxHeight = height))
                    layout(placeable.width, height) { placeable.place(0, 0) }
                },
            ) { slot.options(showing.options) }
        }
    }
}

/**
 * Retient le dernier clavier une fois posé, et rend le clavier quand il remonte de lui-même — l'auteur a touché son texte :
 * seul le FRONT montant compte, pour que le clavier qu'on range en ouvrant les choix ne les referme pas aussitôt.
 */
@Composable
internal fun TypingKeyboardWatcher(slot: StoryTypingSlot, keyboard: TypingKeyboard, measures: TypingMeasures) {
    val density = LocalDensity.current
    val raised by rememberUpdatedState(slot.onKeyboardRaised)
    LaunchedEffect(keyboard, density) {
        var wasRaised = keyboard.target(density) > 0f
        snapshotFlow { keyboard.bottom(density) to keyboard.target(density) }.collect { (bottom, target) ->
            measures.lastKeyboard.floatValue = ComposerKeyboardOrOptions.rememberedKeyboard(measures.lastKeyboard.floatValue, bottom, target)
            val isRaised = target > 0f
            if (isRaised && !wasRaised) raised()
            wasRaised = isRaised
        }
    }
}
