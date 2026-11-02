package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.PresenceLabel
import me.meeshy.sdk.model.PresenceLabels
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarPresenceDot
import me.meeshy.sdk.model.avatar.AvatarPresenceTransition
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.avatar.PresenceHereWave
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.motion.pulse
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyTheme

/** Etiquette de test du point : absent de l'arbre quand rien ne se rend. */
public const val AvatarPresenceDotTestTag: String = "avatar-presence-dot"

/**
 * Le point de presence d'un avatar (miroir du point de `MeeshyAvatar` iOS) : « ici » ([isHere]) prime sur la
 * presence et se rend meme sans presence servie ; hors ligne ou presence absente = AUCUN noeud. Diametre
 * max(6 dp, 26 % / 30 % de [avatarSize]), centre pose a 45 degres sur le cercle de l'avatar (bas-droite,
 * bas-debut en RTL) depuis le coin de [frameSize]. Parametres primitifs : le point ne se recompose pas quand
 * sa ligne parente se recompose.
 */
@Composable
public fun AvatarPresenceDot(
    presence: PresenceState?,
    avatarSize: Float,
    modifier: Modifier = Modifier,
    isHere: Boolean = false,
    here: ConversationHere = ConversationHere.ABSENT,
    frameSize: Float = avatarSize,
) {
    val dot = AvatarPresenceDot.resolve(presence, isHere)
    if (dot == null) return
    val reduceMotion = LocalReduceMotion.current
    var transition by remember { mutableStateOf(AvatarPresenceTransition.initial(dot)) }
    LaunchedEffect(dot.transitionKey) { transition = transition.observe(dot) }
    val label = stringResource(presenceLabelRes(dot))
    Box(modifier = modifier.semantics { contentDescription = label }) {
        AvatarPresenceDotGlyph(
            dot = dot,
            avatarSize = avatarSize,
            frameSize = frameSize,
            pulses = dot.pulses,
            wave = PresenceHereWave.forHere(here),
            arrives = transition.showsArrivalRipple(dot, reduceMotion),
            reduceMotion = reduceMotion,
        )
    }
}

private fun presenceLabelRes(dot: AvatarPresenceDot): Int = when (dot) {
    AvatarPresenceDot.Here -> R.string.presence_here
    is AvatarPresenceDot.Presence -> when (PresenceLabels.label(dot.state)) {
        PresenceLabel.ONLINE -> R.string.presence_online
        PresenceLabel.AWAY -> R.string.presence_away
        PresenceLabel.IDLE -> R.string.presence_idle
        PresenceLabel.OFFLINE -> R.string.presence_offline
        PresenceLabel.HERE -> R.string.presence_here
    }
}

/**
 * Le disque, ses ondes et son liseré — la brique que [MeeshyAvatar] monte dans son coin. Sous Reduire les
 * animations : ni pulsation ni onde, point statique.
 */
@Composable
internal fun AvatarPresenceDotGlyph(
    dot: AvatarPresenceDot,
    avatarSize: Float,
    frameSize: Float,
    pulses: Boolean,
    wave: PresenceHereWave?,
    arrives: Boolean,
    reduceMotion: Boolean,
) {
    val diameter = dot.diameter(avatarSize).dp
    val color = meeshyDotToneColor(dot.tone)
    val shift = AvatarPresenceDot.centerOffset(avatarSize, frameSize, diameter.value).dp
    val directedShift = if (LocalLayoutDirection.current == LayoutDirection.Rtl) -shift else shift
    val liveWave = wave.takeIf { dot == AvatarPresenceDot.Here && !reduceMotion }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.offset(directedShift, shift).testTag(AvatarPresenceDotTestTag),
    ) {
        if (liveWave != null) PresenceHereWaveView(color, diameter, liveWave)
        if (arrives && !reduceMotion) PresenceArrivalRipple(color, diameter)
        Box(
            Modifier
                .size(diameter)
                .then(if (pulses && !reduceMotion) Modifier.pulse(0.12f) else Modifier)
                .background(color, CircleShape)
                .border(MeeshyBorder.strong, MeeshyTheme.tokens.backgroundPrimary, CircleShape),
        )
    }
}
