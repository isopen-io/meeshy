package me.meeshy.ui.component.kit

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** Le conteneur d'une légende : sans, elle coule dans son hôte ; la barre demande sa matière au thème (aucun flou sur Android). */
public enum class MeeshyKeyLegendContainer { None, GlassBar }

/** Un clavier matériel est-il branché ? Lu de la configuration ; faux sur un téléphone nu, donc aucune touche ne ment. */
@Composable
public fun rememberHasHardwareKeyboard(): Boolean {
    val configuration = LocalConfiguration.current
    return configuration.keyboard != Configuration.KEYBOARD_NOKEYS &&
        configuration.hardKeyboardHidden != Configuration.HARDKEYBOARDHIDDEN_YES
}

@Composable
private fun keyNames(): (MeeshyKey, MeeshyKeyPlatform) -> String {
    val command = stringResource(R.string.kit_key_command)
    val control = stringResource(R.string.kit_key_control)
    val shift = stringResource(R.string.kit_key_shift)
    val option = stringResource(R.string.kit_key_option)
    val alt = stringResource(R.string.kit_key_alt)
    val enter = stringResource(R.string.kit_key_enter)
    val escape = stringResource(R.string.kit_key_escape)
    val space = stringResource(R.string.kit_key_space)
    val tab = stringResource(R.string.kit_key_tab)
    val delete = stringResource(R.string.kit_key_delete)
    val up = stringResource(R.string.kit_key_up)
    val down = stringResource(R.string.kit_key_down)
    val left = stringResource(R.string.kit_key_left)
    val right = stringResource(R.string.kit_key_right)
    return { key, platform ->
        val apple = platform == MeeshyKeyPlatform.Apple
        when (key) {
            is MeeshyKey.Character -> key.value.uppercase()
            MeeshyKey.Primary -> if (apple) command else control
            MeeshyKey.Shift -> shift
            MeeshyKey.Option -> if (apple) option else alt
            MeeshyKey.Control -> control
            MeeshyKey.Enter -> enter
            MeeshyKey.Escape -> escape
            MeeshyKey.Space -> space
            MeeshyKey.Tab -> tab
            MeeshyKey.Delete -> delete
            MeeshyKey.Up -> up
            MeeshyKey.Down -> down
            MeeshyKey.Left -> left
            MeeshyKey.Right -> right
        }
    }
}

/**
 * **La touche de raccourci** (K55) : une touche ou une combinaison de touches accolées, toujours le même carré-arrondi en chasse
 * fixe. Elle montre la touche, elle n'écoute pas le clavier : [isPressed] est passé par l'hôte (120 ms) quand il reconnaît le
 * raccourci. Sans clavier matériel ([hasKeyboard] faux) ou sans touche, rien n'est rendu et aucune place n'est réservée. Le
 * modificateur `Primary` s'écrit Ctrl sur Android ; la voix dit « raccourci : Control M » dans la langue de l'app.
 * Jumeau iOS : `MeeshyKeyHint`.
 */
@Composable
@Suppress("LongParameterList")
public fun MeeshyKeyHint(
    keys: List<MeeshyKey>,
    modifier: Modifier = Modifier,
    context: MeeshyKeyHintContext = MeeshyKeyHintContext.Free,
    size: MeeshyKeyHintSize = MeeshyKeyHintSize.Regular,
    surface: MeeshyKeyHintSurface = MeeshyKeyHintSurface.Auto,
    isPressed: Boolean = false,
    platform: MeeshyKeyPlatform = MeeshyKeyPlatform.Other,
    hasKeyboard: Boolean = rememberHasHardwareKeyboard(),
    spokenPrefix: String = stringResource(R.string.kit_key_spoken_prefix),
) {
    val reduce = LocalReduceMotion.current
    val values = MeeshyKeyHintRecipe.resolve(keys, context, size, hasKeyboard, isPressed, reduce)
    if (!values.isRendered) return
    val shown = keys.take(values.keyCount)
    val names = keyNames()
    val spoken = MeeshyKeyHintRule.spoken(shown, platform, spokenPrefix, names)
    val tokens = MeeshyTheme.tokens
    val restFill = when (surface) {
        MeeshyKeyHintSurface.OnAccent -> MeeshyPalette.White.copy(alpha = 0.22f)
        MeeshyKeyHintSurface.OnGlass -> MeeshyPalette.White.copy(alpha = 0.16f)
        MeeshyKeyHintSurface.Auto, MeeshyKeyHintSurface.OnFill -> tokens.controlFill
    }
    val fill = if (values.usesAccent) MeeshyPalette.Indigo500 else restFill
    val ink = if (values.usesAccent) MeeshyPalette.White else tokens.textPrimary
    Row(
        modifier = modifier
            .offset(y = values.pressedOffsetDp.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(values.gapDp.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyKeyHintRule.glyphs(shown, platform).forEach { glyph ->
            KeyCap(glyph, values, fill, ink)
        }
    }
}

@Composable
private fun KeyCap(glyph: String, values: MeeshyKeyHintValues, fill: Color, ink: Color) {
    Box(
        modifier = Modifier
            .height(values.sizeDp.dp)
            .defaultMinSize(minWidth = values.sizeDp.dp)
            .clip(RoundedCornerShape(values.cornerRadiusDp.dp))
            .background(fill)
            .padding(horizontal = (values.paddingDp - 2).dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = glyph,
            color = ink,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = values.textSp.sp,
            maxLines = 1,
            overflow = TextOverflow.Clip,
        )
    }
}

/**
 * **La légende des raccourcis** : des paires touche + libellé, qui passent à la ligne ; un filet entre deux groupes (jamais avant
 * la première paire). [container] `GlassBar` pose la barre de 44 dp. Sans clavier matériel, rien n'est rendu.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun MeeshyKeyLegend(
    items: List<MeeshyKeyLegendItem>,
    modifier: Modifier = Modifier,
    container: MeeshyKeyLegendContainer = MeeshyKeyLegendContainer.None,
    platform: MeeshyKeyPlatform = MeeshyKeyPlatform.Other,
    hasKeyboard: Boolean = rememberHasHardwareKeyboard(),
    leading: (@Composable () -> Unit)? = null,
) {
    if (items.isEmpty() || !hasKeyboard) return
    val rules = remember(items) { MeeshyKeyLegendRule.rulesBefore(items) }
    val barModifier = if (container == MeeshyKeyLegendContainer.GlassBar) {
        Modifier
            .defaultMinSize(minHeight = MeeshyKeyLegendRule.BAR_HEIGHT_DP.dp)
            .clip(RoundedCornerShape(MeeshyKeyLegendRule.BAR_RADIUS_DP.dp))
            .background(MeeshyTheme.tokens.surfaceFill)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    } else {
        Modifier
    }
    FlowRow(
        modifier = modifier.then(barModifier),
        horizontalArrangement = Arrangement.spacedBy(MeeshyKeyLegendRule.GROUP_GAP_DP.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading?.invoke()
        items.forEachIndexed { index, item ->
            if (rules[index]) {
                Box(Modifier.width(1.dp).height(16.dp).background(MeeshyTheme.tokens.hairline).decorative())
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshyKeyLegendRule.PAIR_GAP_DP.dp), verticalAlignment = Alignment.CenterVertically) {
                item.combos.forEach { combo ->
                    MeeshyKeyHint(combo, context = MeeshyKeyHintContext.Legend, size = MeeshyKeyHintSize.Compact, platform = platform, hasKeyboard = true)
                }
                Text(item.title, color = MeeshyTheme.tokens.textSecondary, fontSize = 12.5f.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
