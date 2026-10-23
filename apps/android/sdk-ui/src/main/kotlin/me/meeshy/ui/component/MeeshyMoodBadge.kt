package me.meeshy.ui.component

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.avatar.MoodBadgeMotion
import me.meeshy.sdk.model.avatar.MoodMotion
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion

private val MoodEase = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

/**
 * L'emoji d'humeur pose au coin d'un avatar (iOS `MeeshyMoodBadge`) : UNE ecriture, UNE animation, UN
 * portillon d'accessibilite. Agnostique : trois parametres opaques ([emoji], [diameter], [animates]) ;
 * le contexte d'avatar decide si une humeur « respire », l'atome execute.
 *
 * Elle respire pendant une fenetre d'annonce de [MoodBadgeMotion.BREATHING_DURATION_MILLIS] apres son
 * apparition, puis SE POSE : un mouvement qui ne s'arrete jamais n'informe de rien. Reduire les
 * animations (systeme ou reglage de l'app) l'eteint ; [hushed] (le pair regarde un element en plein
 * ecran) la remplace par un pouls a peine perceptible.
 *
 * [onTap] ne monte un toucher que s'il a un effet ; sa cible fait au moins 48 dp et deborde la pastille
 * sans rien deplacer. [outline] cerne la silhouette de l'emoji de la couleur de presence.
 */
@Composable
public fun MeeshyMoodBadge(
    emoji: String,
    diameter: Dp,
    animates: Boolean,
    modifier: Modifier = Modifier,
    outline: Color? = null,
    hushed: Boolean = false,
    onTap: (() -> Unit)? = null,
) {
    val reduceMotion = LocalReduceMotion.current
    val motion = MoodBadgeMotion.motion(animates = animates, reduceMotion = reduceMotion, hushed = hushed)
    val scale = remember { Animatable(MoodBadgeMotion.RESTING_SCALE) }

    LaunchedEffect(motion) {
        scale.snapTo(MoodBadgeMotion.RESTING_SCALE)
        when (motion) {
            MoodMotion.STILL -> Unit
            MoodMotion.HUSH -> {
                delay(80)
                scale.animateTo(
                    MoodBadgeMotion.HUSHED_SCALE,
                    infiniteRepeatable(tween(MoodBadgeMotion.HUSHED_DURATION_MILLIS, easing = MoodEase), RepeatMode.Reverse),
                )
            }
            MoodMotion.BREATHE -> {
                delay(Random.nextLong(0, MoodBadgeMotion.MAXIMUM_START_DELAY_MILLIS.toLong() + 1))
                withTimeoutOrNull(MoodBadgeMotion.BREATHING_DURATION_MILLIS.toLong()) {
                    scale.animateTo(
                        MoodBadgeMotion.PULSED_SCALE,
                        infiniteRepeatable(tween(BREATH_HALF_PERIOD_MILLIS, easing = MoodEase), RepeatMode.Reverse),
                    )
                }
                scale.animateTo(
                    MoodBadgeMotion.RESTING_SCALE,
                    spring(
                        dampingRatio = MoodBadgeMotion.SPRING_DAMPING,
                        stiffness = MeeshyMotion.stiffnessForResponse(MoodBadgeMotion.SPRING_RESPONSE),
                    ),
                )
            }
        }
    }

    val density = LocalDensity.current
    val glyphSize = with(density) { (diameter * MoodBadgeMotion.GLYPH_RATIO).toSp() }
    val outlineBlur = with(density) { MoodBadgeMotion.outlineWidth(diameter.value).dp.toPx() * 2f }
    val moodDescription = stringResource(R.string.avatar_a11y_mood, emoji)
    val hit = MoodBadgeMotion.hitDiameter(diameter.value).dp

    Box(modifier = modifier.size(diameter), contentAlignment = Alignment.Center) {
        Text(
            text = emoji,
            fontSize = glyphSize,
            style = TextStyle(shadow = outline?.let { Shadow(color = it, blurRadius = outlineBlur) }),
            modifier = Modifier.graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
            },
        )
        if (onTap != null) {
            Box(
                Modifier
                    .requiredSize(hit)
                    .semantics {
                        contentDescription = moodDescription
                        role = Role.Button
                    }
                    .clickable(onClick = onTap),
            )
        }
    }
}

private const val BREATH_HALF_PERIOD_MILLIS: Int = 600
