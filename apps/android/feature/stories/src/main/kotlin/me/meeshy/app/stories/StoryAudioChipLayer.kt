package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import me.meeshy.sdk.model.scene.SceneObjectScalePolicy
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La puce d'un son de premier plan, aux mesures d'iOS `AudioForegroundChip` (capsule de verre sombre, liseré, onde de
 * marque, marges 12 × 8, contenu 54 ou 92, puis son chrono) exprimées sur une scène de 390 de large puis projetées à la
 * largeur réelle : elle garde la même part de la scène que chez l'auteur. Sa pose (#16293) est celle de tout objet : son
 * échelle — portée par la mise en page jusqu'au plafond de [SceneObjectScalePolicy.layered], puis par le calque — et sa
 * rotation. [layoutScaled] faux : toute l'échelle va au calque, comme un sticker du compositeur, pour que la puce ne
 * bouge pas sous les doigts qui la pincent. [clock] : ce que lit son chrono ([AudioChipClock]).
 */
@Composable
internal fun StoryAudioChipLayer(
    chip: StoryAudioChipView,
    modifier: Modifier = Modifier,
    chipModifier: Modifier = Modifier,
    muted: Boolean = false,
    clock: AudioChipClock = AudioChipClock.Still,
    layoutScaled: Boolean = true,
) {
    val spoken = audioChipSpokenLabel(chip)
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val layered = SceneObjectScalePolicy.layered(chip.scale)
        val layoutScale = if (layoutScaled) layered.layout.toFloat() else 1f
        val layerScale = if (layoutScaled) layered.layerFloat else chip.scale.toFloat()
        val unit = maxWidth / AUDIO_CHIP_REFERENCE_WIDTH * layoutScale
        val contentWidth = unit * if (chip.credit != null) AUDIO_CHIP_CREDIT_WIDTH else AUDIO_CHIP_WAVE_WIDTH
        val chipWidth = unit * (2 * AUDIO_CHIP_PAD_X + AUDIO_CHIP_ICON + 2 * AUDIO_CHIP_GAP + AUDIO_CHIP_CHRONO_WIDTH) + contentWidth
        val chipHeight = unit * (2 * AUDIO_CHIP_PAD_Y + AUDIO_CHIP_ICON)
        val density = LocalDensity.current
        Row(
            modifier = Modifier
                .offset(
                    x = maxWidth * chip.x.toFloat() - chipWidth / 2,
                    y = maxHeight * chip.y.toFloat() - chipHeight / 2,
                )
                .size(width = chipWidth, height = chipHeight)
                .graphicsLayer {
                    scaleX = layerScale
                    scaleY = layerScale
                    rotationZ = chip.rotation.toFloat()
                }
                .semantics { contentDescription = spoken }
                .then(chipModifier)
                .alpha(if (muted) AUDIO_CHIP_MUTED_ALPHA else 1f)
                .background(Color.Black.copy(alpha = 0.28f), CircleShape)
                .border(width = unit, color = Color.White.copy(alpha = 0.25f), shape = CircleShape)
                .padding(horizontal = unit * AUDIO_CHIP_PAD_X, vertical = unit * AUDIO_CHIP_PAD_Y),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (muted) me.meeshy.ui.icons.MeeshyIcons.VolumeOff else me.meeshy.ui.icons.MeeshyIcons.Waveform,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(unit * AUDIO_CHIP_ICON),
            )
            Spacer(Modifier.width(unit * AUDIO_CHIP_GAP))
            val credit = chip.credit
            if (credit != null) {
                Text(
                    text = credit,
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = with(density) { (unit * AUDIO_CHIP_CREDIT_SIZE).toSp() },
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(contentWidth),
                )
            } else {
                AudioChipWave(samples = chip.waveform, width = contentWidth, height = unit * AUDIO_CHIP_ICON)
            }
            Spacer(Modifier.width(unit * AUDIO_CHIP_GAP))
            AudioChipChrono(
                timing = chip.timing,
                clock = clock,
                fontSize = with(density) { (unit * AUDIO_CHIP_CREDIT_SIZE).toSp() },
                modifier = Modifier.width(unit * AUDIO_CHIP_CHRONO_WIDTH),
            )
        }
    }
}

@Composable
private fun AudioChipWave(samples: List<Float>, width: Dp, height: Dp) {
    val bars = audioChipBars(samples)
    Row(
        modifier = Modifier.size(width = width, height = height),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        bars.forEach { level ->
            Box(
                modifier = Modifier
                    .width(width / (bars.size * 2))
                    .height(height * level)
                    .background(Color.White.copy(alpha = 0.92f), CircleShape),
            )
        }
    }
}

/** Les barres de l'onde : les échantillons de l'auteur ramenés à [AUDIO_CHIP_BARS], sinon un motif fixe. */
private fun audioChipBars(samples: List<Float>): List<Float> {
    val finite = samples.filter { it.isFinite() }
    if (finite.isEmpty()) return DEFAULT_WAVE
    return List(AUDIO_CHIP_BARS) { index ->
        finite[index * finite.size / AUDIO_CHIP_BARS].coerceIn(0.2f, 1f)
    }
}

private const val AUDIO_CHIP_MUTED_ALPHA = 0.5f
private const val AUDIO_CHIP_REFERENCE_WIDTH = 390f
private const val AUDIO_CHIP_PAD_X = 12f
private const val AUDIO_CHIP_PAD_Y = 8f
private const val AUDIO_CHIP_ICON = 18f
private const val AUDIO_CHIP_GAP = 8f
private const val AUDIO_CHIP_WAVE_WIDTH = 54f
private const val AUDIO_CHIP_CREDIT_WIDTH = 92f
private const val AUDIO_CHIP_CREDIT_SIZE = 12f
private const val AUDIO_CHIP_CHRONO_WIDTH = 32f
private const val AUDIO_CHIP_BARS = 9
private val DEFAULT_WAVE = listOf(0.35f, 0.7f, 0.5f, 0.95f, 0.6f, 0.85f, 0.4f, 0.65f, 0.3f)
