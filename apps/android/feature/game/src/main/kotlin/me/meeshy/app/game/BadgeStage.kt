package me.meeshy.app.game

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.game.BadgeStageFrame
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.GameTimeline
import me.meeshy.ui.component.game.ChoreographyClock
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.component.game.gamePrismTilt
import me.meeshy.ui.component.game.gameSpecularSheen
import me.meeshy.ui.component.game.rememberGameHaptics
import androidx.compose.ui.graphics.Color

/**
 * LE BADGE QUI S'ALLUME OU S'ÉTEINT (iOS `BadgeStage`) : la matière remonte du bas en 0,7 s sur l'empreinte, un reflet
 * la parcourt, une tape légère à 0,5 s. Rien ne se joue au premier rendu : seul un CHANGEMENT de [lit] rejoue la
 * chorégraphie, la tape n'accompagnant que l'allumage. Sous mouvement réduit : un fondu empreinte -> matière.
 */
@Composable
internal fun BadgeStage(
    family: GameMedalFamily,
    glyph: GameMedalGlyph,
    material: GameMaterial,
    lit: Boolean,
    progress: Double,
    label: String?,
    surface: Color,
    muted: Color,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberGameHaptics()
    var play by remember { mutableIntStateOf(0) }
    var shown by remember { mutableStateOf(lit) }
    LaunchedEffect(lit) {
        if (lit == shown) return@LaunchedEffect
        shown = lit
        play += 1
        if (lit) haptics.play(GameHapticPattern.badgeLit)
    }
    val medal: @Composable (GameMedalState, Modifier) -> Unit = { state, extra ->
        GameMedalView(
            family = family, glyph = glyph, material = material, state = state, progress = progress, label = label,
            surface = surface, muted = muted, modifier = extra.let { if (material == GameMaterial.PRISM) it.gamePrismTilt() else it },
        )
    }
    ChoreographyClock(play = play, duration = GameTimeline.BADGE_DURATION, modifier = modifier) { seconds, reduceMotion ->
        val frame = BadgeStageFrame.at(lit, seconds, reduceMotion)
        if (seconds == null) {
            medal(if (lit) GameMedalState.Lit else GameMedalState.Imprint, Modifier)
            return@ChoreographyClock
        }
        Box {
            medal(GameMedalState.Imprint, Modifier)
            if (frame.crossfade) {
                medal(GameMedalState.Lit, Modifier.graphicsLayer { alpha = frame.fill.toFloat() })
            } else {
                medal(
                    GameMedalState.Lit,
                    Modifier
                        .drawWithContent {
                            clipRect(top = size.height * (1f - frame.fill.toFloat())) { this@drawWithContent.drawContent() }
                        }
                        .gameSpecularSheen(frame.sheen),
                )
            }
        }
    }
}
