package me.meeshy.ui.component.audio

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import java.text.NumberFormat
import me.meeshy.sdk.model.chrome.TopChromeBarMotion
import me.meeshy.sdk.model.chrome.TopChromeTint
import me.meeshy.sdk.model.playback.MiniPlayerVisibility
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.topChromeBarSpring
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Ce que la barre dit du vocal qui joue : la personne qui l'a envoye, la conversation, et la couleur de son
 * visage sans photo. La couleur est passee par l'appelant (`DynamicColorGenerator.colorForName`), jamais codee ici.
 */
@Immutable
public data class MiniAudioPlayerBarModel(
    val senderName: String,
    val senderAvatarUrl: String?,
    val conversationName: String,
    val avatarColor: Color,
)

private val BarTouchTarget: Dp = 48.dp
private val AvatarSize: Dp = 36.dp
private const val AVATAR_RIM_ALPHA = 0.22f
private const val SECONDARY_ALPHA = 0.72f
private const val TRACK_ALPHA = 0.24f
private const val REDUCED_MOTION_FADE_MS = 150

/**
 * **Le mini-lecteur** (iOS `MiniAudioPlayerBar`) : un aplat indigo bord a bord, angles droits, qui POUSSE la
 * destination au lieu de la recouvrir (comme la pastille d'appel). Il garde le vocal a portee quand on quitte
 * sa conversation : visage de l'expediteur, conversation, progression, lecture/pause, suivant, fermer.
 *
 * - [model] `null` ⇒ la barre n'est pas la : elle sort sous le ressort partage des barres du haut
 *   ([topChromeBarSpring]), par le haut de l'ecran quand elle est la [isLastBar].
 * - [progress] est une LAMBDA lue dans la couche de dessin : la barre ne se recompose pas a chaque tic du moteur.
 * - Le corps (visage, textes, trait) est UN seul bouton pour TalkBack ; lecture/pause, suivant et fermer ont
 *   chacun leur cible de 48 dp.
 */
@Composable
public fun MiniAudioPlayerBar(
    model: MiniAudioPlayerBarModel?,
    isLastBar: Boolean,
    isPlaying: Boolean,
    progress: () -> Float,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    val density = LocalDensity.current
    val insetTopDp = with(density) { WindowInsets.statusBars.getTop(this).toDp().value }
    val clearancePx = (TopChromeBarMotion.exit(isLastBar, reduceMotion, insetTopDp) as? TopChromeBarMotion.Exit.SlideUp)
        ?.let { with(density) { it.clearanceDp.dp.roundToPx() } }
    // La barre qui part garde ses derniers mots le temps de sa sortie : un modele nul ne la viderait pas.
    val lastModel = remember { arrayOf<MiniAudioPlayerBarModel?>(null) }
    if (model != null) lastModel[0] = model
    val shown = model ?: lastModel[0]
    AnimatedVisibility(
        visible = model != null,
        modifier = modifier.zIndex(TopChromeBarMotion.layer(isLastBar = isLastBar, isCall = false)),
        enter = if (clearancePx == null) {
            fadeIn(tween(REDUCED_MOTION_FADE_MS))
        } else {
            slideInVertically(topChromeBarSpring()) { -it } + expandVertically(topChromeBarSpring<IntSize>())
        },
        exit = if (clearancePx == null) {
            fadeOut(tween(REDUCED_MOTION_FADE_MS))
        } else {
            slideOutVertically(topChromeBarSpring()) { -(it + clearancePx) } + shrinkVertically(topChromeBarSpring<IntSize>())
        },
    ) {
        if (shown != null) {
            MiniAudioPlayerBarContent(
                model = shown,
                isLastBar = isLastBar,
                isPlaying = isPlaying,
                progress = progress,
                onTogglePlay = onTogglePlay,
                onNext = onNext,
                onClose = onClose,
                onOpen = onOpen,
            )
        }
    }
}

@Composable
private fun MiniAudioPlayerBarContent(
    model: MiniAudioPlayerBarModel,
    isLastBar: Boolean,
    isPlaying: Boolean,
    progress: () -> Float,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
    onOpen: () -> Unit,
) {
    val primary = MeeshyPalette.White
    val secondary = MeeshyPalette.White.copy(alpha = SECONDARY_ALPHA)
    Row(
        modifier = Modifier
            // L'encart de la barre d'etat est a la BANDE (une seule proprietaire) : la barre ne le peint pas.
            .then(if (isLastBar) Modifier.statusBarsPadding() else Modifier)
            .fillMaxWidth()
            .background(Color(TopChromeTint.AUDIO_ARGB))
            .padding(top = MeeshySpacing.xsPlus)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        MiniAudioPlayerBarBody(
            model = model,
            primary = primary,
            secondary = secondary,
            progress = progress,
            onOpen = onOpen,
            modifier = Modifier.weight(1f),
        )
        val mirror = if (LocalLayoutDirection.current == LayoutDirection.Rtl) -1f else 1f
        IconButton(onClick = onTogglePlay, modifier = Modifier.size(BarTouchTarget)) {
            Icon(
                imageVector = if (isPlaying) MeeshyIcons.Pause else MeeshyIcons.Play,
                contentDescription = stringResource(if (isPlaying) R.string.mini_player_pause else R.string.mini_player_play),
                tint = primary,
            )
        }
        IconButton(onClick = onNext, modifier = Modifier.size(BarTouchTarget)) {
            Icon(
                imageVector = MeeshyIcons.FastForward,
                contentDescription = stringResource(R.string.mini_player_next),
                tint = secondary,
                modifier = Modifier.graphicsLayer { scaleX = mirror },
            )
        }
        IconButton(onClick = onClose, modifier = Modifier.size(BarTouchTarget)) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.mini_player_close),
                tint = secondary,
            )
        }
    }
}

@Composable
private fun MiniAudioPlayerBarBody(
    model: MiniAudioPlayerBarModel,
    primary: Color,
    secondary: Color,
    progress: () -> Float,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.mini_player_a11y_now_playing, model.senderName, model.conversationName)
    val openHint = stringResource(R.string.mini_player_a11y_open_hint)
    val percentFormat = remember { NumberFormat.getPercentInstance() }
    val currentOnOpen by rememberUpdatedState(onOpen)
    Row(
        modifier = modifier
            .clearAndSetSemantics {
                contentDescription = label
                stateDescription = percentFormat.format(MiniPlayerVisibility.percent(progress().toDouble()) / 100.0)
                role = Role.Button
                onClick(label = openHint) {
                    currentOnOpen()
                    true
                }
            }
            .pointerInput(Unit) { detectTapGestures { currentOnOpen() } },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        MeeshyAvatar(
            name = model.senderName,
            size = AvatarSize,
            containerColor = model.avatarColor,
            presence = null,
            imageUrl = model.senderAvatarUrl,
            modifier = Modifier.border(1.dp, MeeshyPalette.White.copy(alpha = AVATAR_RIM_ALPHA), CircleShape),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = model.senderName,
                color = primary,
                fontSize = MeeshyFontSize.subhead,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = model.conversationName,
                color = secondary,
                fontSize = MeeshyFontSize.caption,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            LinearProgressIndicator(
                progress = { progress().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().height(2.dp).clip(CircleShape),
                color = primary,
                trackColor = primary.copy(alpha = TRACK_ALPHA),
            )
        }
    }
}
