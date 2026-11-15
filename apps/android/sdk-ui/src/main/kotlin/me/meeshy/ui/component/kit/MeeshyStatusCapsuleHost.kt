package me.meeshy.ui.component.kit

import android.content.Context
import android.os.SystemClock
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.delay
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.MeeshyAnimatedVisibility
import me.meeshy.ui.motion.meeshyContentTransform
import me.meeshy.ui.theme.MeeshyMotion

/**
 * Ce que l'hôte lit de l'appareil : l'horloge du silence, le lecteur d'écran, la durée que le système recommande. Entre en
 * paramètre pour que le temps et le lecteur d'écran se jouent sans écran ; aucun singleton. Pendant iOS :
 * `MeeshyStatusCapsuleSession.Effects`.
 */
internal class MeeshyStatusCapsuleEnvironment(
    val nowMillis: () -> Long,
    val isScreenReaderOn: () -> Boolean,
    val recommendedMillis: (original: Int, hasIcon: Boolean, hasControls: Boolean) -> Int,
)

/**
 * **Pose la capsule de statut au-dessus de ce qui porte l'écran** (K14) : [item] non nul ⇒ elle paraît, au bord [edge], avec
 * l'haptique de sa nature ([haptic] = [MeeshyStatusCapsuleHostHaptic.None] laisse l'app jouer le sien) et l'annonce du
 * lecteur d'écran (région vivante de la face) ; elle se retire seule à l'heure de la loi, ou reste tant que l'hôte ne la
 * retire pas quand elle porte une action. Une capsule par hôte : la dernière remplace.
 *
 * L'hôte ne retire rien lui-même : il demande [onDismiss] avec l'`id` à retirer (minuteur, action faite, glisser, ✕, Échap)
 * et l'app pose `item` à `null` SI l'`id` est encore le sien — un minuteur en retard ne ferme jamais son successeur, par
 * construction (annulé au remplacement et au démontage). Un élément identique reposé sous le même `id` ne rejoue rien ; la
 * séance se rejoue quand un champ change (dont `occurrence`) ou après `null`.
 *
 * Il est une surimpression : il remplit son parent, ne prend aucun doigt (le toucher traverse jusqu'à la scène) et pose la
 * capsule à 14 dp du bord, avec 20 dp de marge latérale. L'app lui donne les insets de sa barre (`Modifier.navigationBarsPadding()`).
 * Entrée : glissement de 8 dp depuis le bord et fondu ; « réduire les animations » : le fondu seul, en 150 ms.
 *
 * Pendant iOS : `.meeshyStatusCapsule(_:edge:haptic:)`.
 */
@Composable
public fun MeeshyStatusCapsuleHost(
    item: MeeshyStatusCapsuleItem?,
    onDismiss: (id: String) -> Unit,
    modifier: Modifier = Modifier,
    edge: MeeshyStatusCapsuleEdge = MeeshyStatusCapsuleEdge.Bottom,
    haptic: MeeshyStatusCapsuleHostHaptic = MeeshyStatusCapsuleHostHaptic.Automatic,
    haptics: MeeshyHaptics = rememberMeeshyHaptics(),
) {
    val context = LocalContext.current
    val accessibility = LocalAccessibilityManager.current
    val environment = remember(context, accessibility) {
        MeeshyStatusCapsuleEnvironment(
            nowMillis = { SystemClock.elapsedRealtime() },
            isScreenReaderOn = { context.isScreenReaderOn() },
            recommendedMillis = { original, hasIcon, hasControls ->
                accessibility?.calculateRecommendedTimeoutMillis(
                    originalTimeoutMillis = original.toLong(),
                    containsIcons = hasIcon,
                    containsText = true,
                    containsControls = hasControls,
                )?.toInt() ?: original
            },
        )
    }
    MeeshyStatusCapsuleHostImpl(item, onDismiss, modifier, edge, haptic, haptics, environment)
}

@Composable
internal fun MeeshyStatusCapsuleHostImpl(
    item: MeeshyStatusCapsuleItem?,
    onDismiss: (id: String) -> Unit,
    modifier: Modifier,
    edge: MeeshyStatusCapsuleEdge,
    haptic: MeeshyStatusCapsuleHostHaptic,
    haptics: MeeshyHaptics,
    environment: MeeshyStatusCapsuleEnvironment,
) {
    val latestItem = rememberUpdatedState(item)
    val latestDismiss = rememberUpdatedState(onDismiss)
    val latestEnvironment = rememberUpdatedState(environment)
    val session = remember { MeeshyStatusCapsuleSession() }

    LaunchedEffect(item) {
        val current = item ?: return@LaunchedEffect
        val env = latestEnvironment.value
        session.speakIfDue(current, atMillis = env.nowMillis()) { feedback ->
            if (haptic == MeeshyStatusCapsuleHostHaptic.Automatic) haptics.play(feedback)
        }
        val visible = MeeshyStatusCapsuleTiming.visibleMilliseconds(
            duration = current.duration,
            hasAction = current.action != null,
            isScreenReaderOn = env.isScreenReaderOn(),
        ) ?: return@LaunchedEffect
        val recommended = env.recommendedMillis(visible, current.icon != null, current.action != null)
        delay(maxOf(visible, recommended).toLong())
        if (latestItem.value?.id == current.id) latestDismiss.value(current.id)
    }

    val density = LocalDensity.current
    val reduceMotion = LocalReduceMotion.current
    val slide = with(density) { MeeshyStatusCapsuleRecipe.slideOffset.roundToPx() } * (if (edge == MeeshyStatusCapsuleEdge.Bottom) 1 else -1)
    Box(
        modifier = modifier.fillMaxSize().padding(
            horizontal = MeeshyStatusCapsuleRecipe.sideMargin,
            vertical = MeeshyStatusCapsuleRecipe.edgeGap,
        ),
        contentAlignment = if (edge == MeeshyStatusCapsuleEdge.Bottom) Alignment.BottomCenter else Alignment.TopCenter,
    ) {
        MeeshyAnimatedVisibility(
            value = item,
            enter = fadeIn(MeeshyMotion.springFast()) + slideInVertically(MeeshyMotion.springFast()) { slide },
            exit = fadeOut(MeeshyMotion.springFast()) + slideOutVertically(MeeshyMotion.springFast()) { slide },
            label = "meeshyStatusCapsule",
        ) { held ->
            AnimatedContent(
                targetState = held,
                contentKey = { it.id },
                transitionSpec = {
                    meeshyContentTransform(
                        reduce = reduceMotion,
                        full = fadeIn(tween(MeeshyStatusCapsuleRecipe.REDUCED_FADE_MILLIS)) togetherWith
                            fadeOut(tween(MeeshyStatusCapsuleRecipe.REDUCED_FADE_MILLIS)) using SizeTransform(clip = false) { _, _ -> snap() },
                    )
                },
                label = "meeshyStatusCapsuleContent",
            ) { target ->
                val live = if (target.id == held.id) held else target
                HostedCapsule(item = live, edge = edge, haptics = haptics, onDismiss = { latestDismiss.value(live.id) })
            }
        }
    }
}

/** La face d'un élément, avec son action et sa fermeture remises à l'hôte : l'action part, puis l'hôte retire. */
@Composable
private fun HostedCapsule(
    item: MeeshyStatusCapsuleItem,
    edge: MeeshyStatusCapsuleEdge,
    haptics: MeeshyHaptics,
    onDismiss: () -> Unit,
) {
    val latestDismiss = rememberUpdatedState(onDismiss)
    val latestItem = rememberUpdatedState(item)
    val action = remember(item.action) {
        item.action?.let { given ->
            MeeshyStatusCapsuleAction(label = given.label, icon = given.icon) {
                latestItem.value.action?.onClick?.invoke()
                latestDismiss.value()
            }
        }
    }
    val closing: (() -> Unit)? = remember(item.onDismiss != null) {
        if (item.onDismiss == null) {
            null
        } else {
            {
                latestItem.value.onDismiss?.invoke()
                latestDismiss.value()
            }
        }
    }
    MeeshyStatusCapsule(
        message = item.message,
        detail = item.detail,
        icon = item.icon,
        kind = item.kind,
        action = action,
        closeLabel = item.closeLabel,
        onDismiss = closing,
        edge = edge,
        tone = item.tone,
        tint = item.tint,
        haptics = haptics,
    )
}

/**
 * Ce que l'hôte garde d'UNE séance : le dernier `id` parlé et son instant, pour le silence de 2 s. Aucune file, aucun
 * singleton : la séance naît avec l'hôte et meurt avec lui.
 */
internal class MeeshyStatusCapsuleSession {
    private var lastSpoken: MeeshyStatusCapsuleTiming.Spoken? = null

    /** Joue l'haptique de la nature, une fois par `id` : le même `id` redit dans les 2 s se tait. */
    fun speakIfDue(item: MeeshyStatusCapsuleItem, atMillis: Long, play: (MeeshyStatusCapsuleFeedback) -> Unit) {
        if (!MeeshyStatusCapsuleTiming.speaks(id = item.id, atMillis = atMillis, last = lastSpoken)) return
        lastSpoken = MeeshyStatusCapsuleTiming.Spoken(id = item.id, atMillis = atMillis)
        play(item.kind.feedback)
    }
}

/** Le site unique de l'haptique : la nature de la capsule joue le retour du kit. */
internal fun MeeshyHaptics.play(feedback: MeeshyStatusCapsuleFeedback) {
    when (feedback) {
        MeeshyStatusCapsuleFeedback.Light -> light()
        MeeshyStatusCapsuleFeedback.Success -> success()
        MeeshyStatusCapsuleFeedback.Warning -> warning()
        MeeshyStatusCapsuleFeedback.Error -> error()
    }
}

private fun Context.isScreenReaderOn(): Boolean {
    val manager = getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
    return manager.isEnabled && manager.isTouchExplorationEnabled
}
