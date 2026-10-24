package me.meeshy.ui.component.game

import me.meeshy.ui.accessibility.LocalReduceMotion
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.game.GameChoreographyLaw

/**
 * L'horloge d'une chorégraphie : rend à chaque image le temps écoulé depuis le dernier déclenchement, et le
 * contenu s'en sert pour se dessiner (`GameTimeline`). Ce n'est pas une animation implicite : c'est une
 * lecture, ce qui rend la durée exacte et la pause immédiate quand la vue quitte l'écran.
 *
 *  - rien ne tourne au repos : ni avant le premier déclenchement, ni après la fin ;
 *  - [play] s'incrémente pour (re)jouer ; 0 = jamais joué, le contenu reçoit `null` ;
 *  - la boucle d'images s'arrête hors écran, y compris dans une colonne défilante non paresseuse ;
 *  - sous mouvement réduit, la durée tombe à un fondu et le contenu en est informé.
 */
@Composable
public fun ChoreographyClock(
    play: Int,
    duration: Double,
    modifier: Modifier = Modifier,
    content: @Composable (seconds: Double?, reduceMotion: Boolean) -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    var visible by remember { mutableStateOf(true) }
    var playedFor by remember { mutableIntStateOf(0) }
    var startedAtMillis by remember { mutableLongStateOf(NOT_STARTED) }
    var nowMillis by remember { mutableLongStateOf(0L) }

    LaunchedEffect(play, visible, reduceMotion) {
        if (play <= 0 || !visible) return@LaunchedEffect
        if (playedFor != play) {
            playedFor = play
            val first = frameMillis()
            startedAtMillis = first
            nowMillis = first
        }
        while (GameChoreographyLaw.isRunning(startedAtMillis.orNull(), nowMillis, duration, reduceMotion)) {
            nowMillis = frameMillis()
        }
        nowMillis = frameMillis()
    }

    Box(modifier.gameOnScreen { visible = it }) {
        content(
            GameChoreographyLaw.elapsed(startedAtMillis.orNull(), nowMillis, duration, reduceMotion),
            reduceMotion,
        )
    }
}

private const val NOT_STARTED: Long = Long.MIN_VALUE

private fun Long.orNull(): Long? = if (this == NOT_STARTED) null else this

private suspend fun frameMillis(): Long =
    androidx.compose.runtime.withFrameMillis { it }
