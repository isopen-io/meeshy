package me.meeshy.ui.component.kit

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

@Composable
private fun rememberTranslationMarkWords(): MeeshyTranslationMarkWords {
    val resources = LocalContext.current.resources
    val configuration = LocalConfiguration.current
    return remember(resources, configuration) {
        MeeshyTranslationMarkWords(
            translated = resources.getString(R.string.kit_translation_mark_translated),
            translatedFrom = { resources.getString(R.string.kit_translation_mark_translated_from, it) },
            original = resources.getString(R.string.kit_translation_mark_original),
            originalFrom = { resources.getString(R.string.kit_translation_mark_original_from, it) },
            showTranslation = resources.getString(R.string.kit_translation_mark_show_translation),
            showOriginal = resources.getString(R.string.kit_translation_mark_show_original),
            valueOriginal = resources.getString(R.string.kit_translation_mark_value_original),
            valueTranslated = resources.getString(R.string.kit_translation_mark_value_translated),
        )
    }
}

/**
 * **La marque qui annonce la langue servie** (K51) : un glyphe, une mention (« Traduit de l'italien ») et, si l'hôte la
 * donne, une bascule vers l'original. Trois densités — le glyphe seul devant un aperçu, la ligne sous un texte, la légende
 * sur un média — et trois modes : traduction servie, original servi, annonce d'avant l'envoi.
 *
 * Elle ANNONCE ce que l'hôte rend et ne résout rien : l'hôte remet [isShowingOriginal] et le nom de langue, déjà accordé
 * (« l'italien »). Sous 320 dp le point s'en va et la bascule passe sous la mention ; la bascule garde une cible de 44 dp,
 * s'éteint à 50 % tant que [isPending], et le changement de mention se fond en 200 ms (rien sous mouvement réduit).
 * Jumeau iOS : `MeeshyTranslationMark`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyTranslationMark(
    modifier: Modifier = Modifier,
    density: MeeshyTranslationMarkDensity = MeeshyTranslationMarkDensity.Line,
    mode: MeeshyTranslationMarkMode? = null,
    isShowingOriginal: Boolean = false,
    languageName: String? = null,
    tint: Color? = null,
    isPending: Boolean = false,
    onToggle: (() -> Unit)? = null,
) {
    val reduce = LocalReduceMotion.current
    val resolvedMode = MeeshyTranslationMarkRecipe.resolveMode(mode, isShowingOriginal)
    val words = rememberTranslationMarkWords()
    val accent = tint ?: MeeshyPalette.Indigo500
    val tokens = MeeshyTheme.tokens
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    BoxWithConstraints(modifier = modifier) {
        val values = MeeshyTranslationMarkRecipe.resolve(density, resolvedMode, onToggle != null, pressed, isPending, maxWidth.value, reduce)
        val mention = words.mention(resolvedMode, languageName)
        val glyphInk = if (values.glyphIsMuted) tokens.textMuted else accent
        val glyph: @Composable () -> Unit = {
            Icon(
                MeeshyIcons.Translate,
                contentDescription = if (values.showsMention) null else mention,
                tint = glyphInk,
                modifier = Modifier.size(values.glyphSizeDp.dp),
            )
        }
        val mentionText: @Composable () -> Unit = {
            Crossfade(targetState = mention, animationSpec = tween(values.crossfadeMillis), label = "translation-mark-mention") {
                Text(it, color = tokens.textSecondary, fontSize = values.textSizeSp.sp, fontWeight = FontWeight(values.mentionWeight))
            }
        }
        val toggle: @Composable () -> Unit = {
            val verb = words.toggle(resolvedMode)
            val state = words.toggleValue(resolvedMode)
            Text(
                verb,
                color = accent,
                fontSize = values.textSizeSp.sp,
                fontWeight = FontWeight(values.toggleWeight),
                modifier = Modifier
                    .meeshyTapTarget(values.tapTargetDp.dp)
                    .graphicsLayer { scaleX = values.toggleScale; scaleY = values.toggleScale }
                    .alpha(values.toggleOpacity * values.toggleInkOpacity)
                    .semantics { contentDescription = verb; stateDescription = state; role = Role.Button }
                    .clickable(interactionSource = interaction, indication = null, enabled = values.acceptsToggle, role = Role.Button) { onToggle?.invoke() },
            )
        }
        val line: @Composable () -> Unit = {
            Row(horizontalArrangement = Arrangement.spacedBy(values.separatorSpacingDp.dp), verticalAlignment = Alignment.CenterVertically) {
                glyph()
                if (values.showsMention) mentionText()
                if (values.showsSeparator) Text("·", color = tokens.textMuted, fontSize = values.textSizeSp.sp, modifier = Modifier.decorative())
                if (values.showsToggle && !values.wrapsToggle) toggle()
            }
        }
        if (values.wrapsToggle) {
            Column { line(); toggle() }
        } else {
            line()
        }
    }
}
