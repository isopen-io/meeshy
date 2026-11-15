package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette

/** La variante d'une ligne : [Destructive] (rouge, en dernier), [Accent] (teinte de mention ou de conversation). */
public enum class MeeshyToggleRowKind {
    Normal,
    Destructive,
    Accent,
}

/** Le retour haptique d'une action. [None] quand l'hôte joue le sien. */
public enum class MeeshyToggleRowHaptic {
    Light,
    None,
}

/** L'accessoire de fin : ce que la ligne DIT de son état. [None] ne rend rien. */
@Immutable
public sealed interface MeeshyToggleRowAccessory {
    public data object None : MeeshyToggleRowAccessory

    @Immutable
    public data class Toggle(val isOn: Boolean) : MeeshyToggleRowAccessory

    @Immutable
    public data class Check(val isSelected: Boolean) : MeeshyToggleRowAccessory

    @Immutable
    public data class Checkbox(val isChecked: Boolean) : MeeshyToggleRowAccessory

    public data object Chevron : MeeshyToggleRowAccessory

    @Immutable
    public data class Value(val text: String) : MeeshyToggleRowAccessory
}

/** Ce que l'accessibilité lit de l'accessoire, sans chaîne localisée. */
@Immutable
public sealed interface MeeshyToggleRowValue {
    public data object None : MeeshyToggleRowValue

    @Immutable
    public data class Toggle(val isOn: Boolean) : MeeshyToggleRowValue

    @Immutable
    public data class Selected(val isSelected: Boolean) : MeeshyToggleRowValue

    @Immutable
    public data class Text(val text: String) : MeeshyToggleRowValue
}

/**
 * La recette en valeurs d'une ligne : encres, voiles, filet et lecture de l'accessibilité. Pure : elle ne lit ni
 * environnement ni singleton, tout lui est passé. Aucune couleur n'est écrite ici, elle vient des jetons.
 * Miroir de `MeeshyToggleRowRecipe` (iOS).
 */
@Immutable
public data class MeeshyToggleRowRecipe(
    val minimumHeight: Dp,
    val contentOpacity: Float,
    val titleColor: Color,
    val subtitleColor: Color,
    val accessoryColor: Color,
    val trackOnColor: Color,
    val trackOffColor: Color,
    val thumbColor: Color,
    val dividerColor: Color,
    val veilOpacity: Float,
    val veilColor: Color,
    val accessibilityValue: MeeshyToggleRowValue,
) {
    public companion object {
        public val rowMinimumHeight: Dp = 46.dp
        public val checkboxSide: Dp = 24.dp
        public const val DISABLED_OPACITY: Float = 0.62f
        public const val PRESSED_VEIL_OPACITY: Float = MeeshyOpacity.light
        public const val HOVERED_VEIL_OPACITY: Float = MeeshyOpacity.subtle
        public const val FADE_DURATION_MILLIS: Int = 200

        /** Au-delà de cette échelle de police, l'accessoire passe sous le titre (l'équivalent d'`isAccessibilitySize`). */
        public const val ACCESSIBILITY_FONT_SCALE: Float = 1.3f

        public fun resolve(
            accessory: MeeshyToggleRowAccessory,
            kind: MeeshyToggleRowKind,
            tone: MeeshyGlassTone?,
            isDark: Boolean,
            isEnabled: Boolean,
            isPressed: Boolean,
            isHovered: Boolean,
            tint: Color?,
        ): MeeshyToggleRowRecipe {
            val isThemeInk = tone == MeeshyGlassTone.Theme
            val baseInk = if (isThemeInk) MeeshyAdaptiveColors.textPrimary(isDark) else MeeshyMediaChromeColors.OnMedia
            val mutedInk = if (isThemeInk) MeeshyAdaptiveColors.textSecondary(isDark) else MeeshyMediaChromeColors.OnMediaMuted
            val titleColor = titleInk(kind = kind, base = baseInk, isThemeInk = isThemeInk, isDark = isDark, tint = tint)
            val trackOn = tint ?: MeeshyPalette.Indigo500
            val veil = veilOpacity(isEnabled = isEnabled, isPressed = isPressed, isHovered = isHovered)
            return MeeshyToggleRowRecipe(
                minimumHeight = rowMinimumHeight,
                contentOpacity = if (isEnabled) 1f else DISABLED_OPACITY,
                titleColor = titleColor,
                subtitleColor = mutedInk,
                accessoryColor = if (isChosen(accessory)) trackOn else mutedInk,
                trackOnColor = trackOn,
                trackOffColor = baseInk.copy(alpha = MeeshyOpacity.medium),
                thumbColor = MeeshyMediaChromeColors.OnMedia,
                dividerColor = baseInk.copy(alpha = MeeshyOpacity.subtle),
                veilOpacity = veil,
                veilColor = titleColor.copy(alpha = veil),
                accessibilityValue = valueFor(accessory),
            )
        }

        /** « Titre, sous-titre » : un sous-titre vide ou blanc n'existe pas pour le lecteur d'écran. */
        public fun accessibilityLabel(title: String, subtitle: String?): String {
            val visible = visibleSubtitle(subtitle) ?: return title
            return "$title, $visible"
        }

        /** Le sous-titre tel qu'il se rend : absent s'il est vide ou blanc. */
        public fun visibleSubtitle(subtitle: String?): String? = subtitle?.trim()?.takeIf { it.isNotEmpty() }

        /** Une coche, une case cochée ou une bascule ouverte prennent l'encre de la piste ; le reste est muet. */
        public fun isChosen(accessory: MeeshyToggleRowAccessory): Boolean = when (accessory) {
            is MeeshyToggleRowAccessory.Check -> accessory.isSelected
            is MeeshyToggleRowAccessory.Checkbox -> accessory.isChecked
            is MeeshyToggleRowAccessory.Toggle -> accessory.isOn
            MeeshyToggleRowAccessory.None, MeeshyToggleRowAccessory.Chevron, is MeeshyToggleRowAccessory.Value -> false
        }

        public fun valueFor(accessory: MeeshyToggleRowAccessory): MeeshyToggleRowValue = when (accessory) {
            MeeshyToggleRowAccessory.None, MeeshyToggleRowAccessory.Chevron -> MeeshyToggleRowValue.None
            is MeeshyToggleRowAccessory.Toggle -> MeeshyToggleRowValue.Toggle(isOn = accessory.isOn)
            is MeeshyToggleRowAccessory.Check -> MeeshyToggleRowValue.Selected(isSelected = accessory.isSelected)
            is MeeshyToggleRowAccessory.Checkbox -> MeeshyToggleRowValue.Selected(isSelected = accessory.isChecked)
            is MeeshyToggleRowAccessory.Value -> MeeshyToggleRowValue.Text(text = accessory.text)
        }

        /** Le voile de l'appui ou du survol. Une ligne désactivée ne répond pas : aucun voile. */
        public fun veilOpacity(isEnabled: Boolean, isPressed: Boolean, isHovered: Boolean): Float = when {
            !isEnabled -> 0f
            isPressed -> PRESSED_VEIL_OPACITY
            isHovered -> HOVERED_VEIL_OPACITY
            else -> 0f
        }

        private fun titleInk(kind: MeeshyToggleRowKind, base: Color, isThemeInk: Boolean, isDark: Boolean, tint: Color?): Color =
            when (kind) {
                MeeshyToggleRowKind.Normal -> base
                MeeshyToggleRowKind.Destructive ->
                    if (isThemeInk && !isDark) MeeshyAdaptiveColors.errorInk(isDark = false) else MeeshyPalette.Error
                MeeshyToggleRowKind.Accent -> tint ?: MeeshyAdaptiveColors.mentionColor(isDark)
            }
    }
}
