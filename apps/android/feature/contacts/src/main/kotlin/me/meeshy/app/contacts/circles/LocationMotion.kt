package me.meeshy.app.contacts.circles

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.SharedLocationMotion
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

private const val TICK_MS = 15_000L
private const val BADGE_DP = 18

/**
 * Ce que fait la personne qui me montre sa position (#19887, #20665) — iso `LocationMotionGlyph.swift` : un glyphe au bord
 * de son épingle, et le mot qui le dit au lecteur d'écran et dans « Autour de toi ». Immobile ne se dessine pas
 * ([SharedLocationMotion.drawn]), l'absence de glyphe le dit déjà.
 */
internal fun motionIcon(motion: SharedLocationMotion): ImageVector? = when (motion) {
    SharedLocationMotion.STATIONARY -> null
    SharedLocationMotion.WALKING -> MeeshyIcons.Walking
    SharedLocationMotion.RUNNING -> MeeshyIcons.Running
    SharedLocationMotion.CYCLING -> MeeshyIcons.Cycling
    SharedLocationMotion.AUTOMOTIVE -> MeeshyIcons.CarFilled
}

@StringRes
internal fun motionRes(motion: SharedLocationMotion): Int? = when (motion) {
    SharedLocationMotion.STATIONARY -> null
    SharedLocationMotion.WALKING -> R.string.location_map_motion_walking
    SharedLocationMotion.RUNNING -> R.string.location_map_motion_running
    SharedLocationMotion.CYCLING -> R.string.location_map_motion_cycling
    SharedLocationMotion.AUTOMOTIVE -> R.string.location_map_motion_automotive
}

/** Le glyphe posé au bord de l'avatar d'une épingle. Le libellé de l'épingle le dit déjà : il est muet. */
@Composable
internal fun LocationMotionBadge(motion: SharedLocationMotion, modifier: Modifier = Modifier) {
    val icon = motionIcon(motion) ?: return
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(BADGE_DP.dp)
            .background(MeeshyPalette.Indigo700, CircleShape)
            .border(1.5.dp, Color.White, CircleShape),
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.padding(3.dp))
    }
}

/** L'horloge de la carte : elle vieillit le mouvement et le compte à rebours sans attendre un nouvel envoi. */
@Composable
internal fun rememberNowMillis(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(TICK_MS)
            now = System.currentTimeMillis()
        }
    }
    return now
}

/** Le mot du mouvement à dire maintenant, ou `null` : non servi, périmé, ou immobile. */
@Composable
internal fun motionWord(pin: SharedLocationPin, nowMillis: Long): String? =
    pin.drawnMotion(nowMillis)?.let(::motionRes)?.let { stringResource(it) }

/** « À pied · Position exacte » — la ligne d'une personne, iso `NearbyMapScreen` (le mouvement d'abord). */
@Composable
internal fun withMotion(pin: SharedLocationPin, nowMillis: Long, base: String): String =
    motionWord(pin, nowMillis)?.let { "$it · $base" } ?: base
