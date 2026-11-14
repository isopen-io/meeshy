package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La tenue d'un bouton rond de verre. L'ambre d'une pause automatique n'est pas une tenue : il passe par `glyphTint`.
 * Miroir de `MeeshyGlassButtonKind` (iOS).
 */
public enum class MeeshyGlassButtonKind {
    Normal,
    Active,
    Destructive,
    Soft,
}

/**
 * Les quatre diamètres de la planche. La cible tactile occupe au moins [MeeshyControlSize.minTouchTarget] (48 dp),
 * quel que soit le diamètre dessiné. Miroir de `MeeshyGlassButtonSize` (iOS, dont la cible est de 44 pt).
 */
public enum class MeeshyGlassButtonSize(public val diameterDp: Float) {
    S36(MeeshyControlSize.regular.value),
    S40(MeeshyControlSize.large.value),
    S44(MeeshyControlSize.tapTarget.value),
    S48(EXTRA_LARGE_DIAMETER_DP),
    ;

    /** Le côté de la cible tactile : au moins 48 dp. */
    public val targetSideDp: Float get() = maxOf(diameterDp, MeeshyControlSize.minTouchTarget.value)

    /** Ce dont la cible déborde le disque, de chaque côté : l'encombrement reste le diamètre. */
    public val hitSlackDp: Float get() = (targetSideDp - diameterDp) / 2f

    /**
     * Le glyphe, figé dans son disque (46 % du diamètre à un point près), par les jetons d'icône : la taille de police
     * du système ne le touche pas.
     */
    public val glyphSizeDp: Float
        get() = when (this) {
            S36, S40 -> MeeshyIconSize.lg.value
            S44 -> MeeshyIconSize.xl.value
            S48 -> MeeshyIconSize.xxl.value
        }
}

/**
 * Le jeton `MeeshyControlSize.xLarge` (48) n'existe pas encore : il entre avec ses miroirs iOS et web, que garde
 * `MeeshyScalesParityTest`.
 */
private const val EXTRA_LARGE_DIAMETER_DP: Float = 48f

/** Le retour haptique d'une activation. [None] quand l'hôte joue le sien. */
public enum class MeeshyGlassButtonHaptic {
    Light,
    None,
}

/**
 * L'état que le bouton DIT à l'hôte et au lecteur d'écran. Vrai ⇒ la tenue [MeeshyGlassButtonKind.Active] quand l'hôte
 * n'en force pas une autre. Miroir de `MeeshyGlassButtonActivation` (iOS).
 *
 * `@Immutable` : un hôte qui écrit `Toggle(isOn)` en ligne crée une instance par recomposition ; sans cette marque, Compose
 * compare l'interface par identité et recompose le bouton à valeur égale.
 */
@Immutable
public sealed interface MeeshyGlassButtonActivation {
    public val isOn: Boolean

    public data object None : MeeshyGlassButtonActivation {
        override val isOn: Boolean = false
    }

    public data class Toggle(override val isOn: Boolean) : MeeshyGlassButtonActivation

    public data class Selected(override val isOn: Boolean) : MeeshyGlassButtonActivation

    public data class Expanded(override val isOn: Boolean) : MeeshyGlassButtonActivation

    public val impliedKind: MeeshyGlassButtonKind
        get() = if (isOn) MeeshyGlassButtonKind.Active else MeeshyGlassButtonKind.Normal
}

/** Le fond plein que K02 peint lui-même. Le verre, lui, vient de K01. */
public enum class MeeshyGlassButtonFill {
    Clear,
    White,
    Red,
    Veil,
    ThemeInk,
}

/**
 * Ce que K02 demande à K01 : aucune matière, ou un verre interactif au ton de l'hôte. Android n'a pas de Liquid Glass :
 * le destructif n'y est jamais un verre teinté, il est rouge plein.
 */
public enum class MeeshyGlassButtonGlassRequest {
    None,
    Neutral,
}

/** L'encre du glyphe : celle de la tenue, celle du thème, ou celle que l'hôte impose. */
public sealed interface MeeshyGlassButtonInk {
    public data object OnMedia : MeeshyGlassButtonInk

    public data object OnSolid : MeeshyGlassButtonInk

    public data object ThemeInk : MeeshyGlassButtonInk

    public data object ThemeInverse : MeeshyGlassButtonInk

    public data class Custom(val color: Color) : MeeshyGlassButtonInk
}

/**
 * La couleur de l'anneau du focus clavier. Décalé du disque, il se pose sur ce qui est DESSOUS : sa couleur suit le ton
 * qui a été élu pour ce dessous (règle du `:focus-visible` de K01 sur le web), et l'encre de la planche dans un verre.
 */
public enum class MeeshyGlassButtonFocusRing {
    OnMedia,
    MediaBackdrop,
    ThemeInk,
}

/** L'ombre de l'actif : le flou de la planche (CSS) en rayon, comme K01 le fait pour le verre. */
@Immutable
public data class MeeshyGlassButtonShadow(val opacity: Float, val radiusDp: Float, val yDp: Float)

/**
 * La recette d'un bouton rond en VALEURS : un composable ne s'inspecte pas, sa recette si. Toute valeur chiffrée du
 * bouton vit ici, nulle part ailleurs. Miroir de `MeeshyGlassButtonRecipe` (iOS), mêmes vecteurs de parité.
 */
@Immutable
public data class MeeshyGlassButtonRecipe(
    val kind: MeeshyGlassButtonKind,
    val size: MeeshyGlassButtonSize,
    val diameterDp: Float,
    val glyphSizeDp: Float,
    val targetSideDp: Float,
    val fill: MeeshyGlassButtonFill,
    /** L'opacité du fond plein, appui et survol compris. */
    val fillOpacity: Float,
    /** Le voile d'appui blanc, là où K01 ne pose pas de matière (fonds pleins, bouton emboîté). Il part au toucher. */
    val pressVeilOpacity: Float,
    val glass: MeeshyGlassButtonGlassRequest,
    val ink: MeeshyGlassButtonInk,
    val shadow: MeeshyGlassButtonShadow?,
    /** L'anneau du focus clavier (jamais au doigt : un bouton ne prend le focus qu'au clavier). */
    val focusRing: MeeshyGlassButtonFocusRing,
    val opacity: Float,
    val isActionEnabled: Boolean,
) {
    /** Désactivé : ni réponse au toucher, ni haptique, ni action. */
    public val respondsToTouch: Boolean get() = isActionEnabled

    public val playsHaptic: Boolean get() = isActionEnabled

    public companion object {
        public const val DISABLED_OPACITY: Float = 0.4f
        public const val REST_FILL_OPACITY: Float = 0.94f
        public const val PRESSED_ACTIVE_FILL_OPACITY: Float = 0.78f
        public const val HOVERED_ACTIVE_FILL_OPACITY: Float = 0.86f
        public const val SOFT_REST_OPACITY: Float = 0.12f
        public const val SOFT_PRESSED_OPACITY: Float = 0.22f
        public const val SOFT_HOVERED_OPACITY: Float = 0.17f
        public const val PRESS_VEIL_PRESSED_OPACITY: Float = 0.22f
        public const val PRESS_VEIL_HOVERED_OPACITY: Float = 0.11f
        public const val LONG_PRESS_MILLIS: Long = 500L
        public const val LONG_PRESS_MAX_MOVEMENT_DP: Float = 10f
        public const val FOCUS_RING_WIDTH_DP: Float = 2f
        public const val FOCUS_RING_OFFSET_DP: Float = 2f

        /** Le flou de l'ombre de l'actif sur la planche (`0 4px 14px`) ; le rayon en est la moitié, comme pour le verre de K01. */
        public const val ACTIVE_SHADOW_BLUR: Float = 14f
        private const val ACTIVE_SHADOW_OPACITY: Float = 0.22f
        private const val ACTIVE_SHADOW_Y_DP: Float = 4f
        private val ActiveShadow = MeeshyGlassButtonShadow(
            opacity = ACTIVE_SHADOW_OPACITY,
            radiusDp = ACTIVE_SHADOW_BLUR / 2f,
            yDp = ACTIVE_SHADOW_Y_DP,
        )

        /**
         * [tone] est le ton EFFECTIF (celui de l'hôte quand le bouton n'en pose pas). [isNested] : le bouton est posé
         * dans un verre dessiné du kit. Android n'a qu'une matière dessinée : la recette n'en dépend pas.
         */
        public fun resolve(
            kind: MeeshyGlassButtonKind,
            size: MeeshyGlassButtonSize,
            tone: MeeshyGlassTone = MeeshyGlassTone.Deep,
            isNested: Boolean = false,
            isPressed: Boolean = false,
            isHovered: Boolean = false,
            isEnabled: Boolean = true,
            glyphTint: Color? = null,
        ): MeeshyGlassButtonRecipe {
            val pressed = isPressed && isEnabled
            val hovered = isHovered && isEnabled && !pressed
            val glass = glassRequest(kind)
            val drawsOwnResponse = glass == MeeshyGlassButtonGlassRequest.None || isNested
            return MeeshyGlassButtonRecipe(
                kind = kind,
                size = size,
                diameterDp = size.diameterDp,
                glyphSizeDp = size.glyphSizeDp,
                targetSideDp = size.targetSideDp,
                fill = solidFill(kind, tone),
                fillOpacity = fillOpacity(kind, pressed, hovered),
                pressVeilOpacity = pressVeilOpacity(kind, drawsOwnResponse, pressed, hovered),
                glass = glass,
                ink = ink(kind, tone, glyphTint),
                shadow = if (kind == MeeshyGlassButtonKind.Active) ActiveShadow else null,
                focusRing = focusRing(tone, isNested),
                opacity = if (isEnabled) 1f else DISABLED_OPACITY,
                isActionEnabled = isEnabled,
            )
        }

        private fun solidFill(kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone): MeeshyGlassButtonFill = when (kind) {
            MeeshyGlassButtonKind.Normal -> MeeshyGlassButtonFill.Clear
            MeeshyGlassButtonKind.Active -> if (tone == MeeshyGlassTone.Theme) MeeshyGlassButtonFill.ThemeInk else MeeshyGlassButtonFill.White
            MeeshyGlassButtonKind.Destructive -> MeeshyGlassButtonFill.Red
            MeeshyGlassButtonKind.Soft -> MeeshyGlassButtonFill.Veil
        }

        private fun focusRing(tone: MeeshyGlassTone, isNested: Boolean): MeeshyGlassButtonFocusRing = when {
            isNested -> MeeshyGlassButtonFocusRing.OnMedia
            tone == MeeshyGlassTone.Plain -> MeeshyGlassButtonFocusRing.OnMedia
            tone == MeeshyGlassTone.Theme -> MeeshyGlassButtonFocusRing.ThemeInk
            else -> MeeshyGlassButtonFocusRing.MediaBackdrop
        }

        private fun glassRequest(kind: MeeshyGlassButtonKind): MeeshyGlassButtonGlassRequest =
            if (kind == MeeshyGlassButtonKind.Normal) MeeshyGlassButtonGlassRequest.Neutral else MeeshyGlassButtonGlassRequest.None

        private fun fillOpacity(kind: MeeshyGlassButtonKind, pressed: Boolean, hovered: Boolean): Float = when (kind) {
            MeeshyGlassButtonKind.Normal -> 0f
            MeeshyGlassButtonKind.Destructive -> REST_FILL_OPACITY
            MeeshyGlassButtonKind.Active -> when {
                pressed -> PRESSED_ACTIVE_FILL_OPACITY
                hovered -> HOVERED_ACTIVE_FILL_OPACITY
                else -> REST_FILL_OPACITY
            }
            MeeshyGlassButtonKind.Soft -> when {
                pressed -> SOFT_PRESSED_OPACITY
                hovered -> SOFT_HOVERED_OPACITY
                else -> SOFT_REST_OPACITY
            }
        }

        private fun pressVeilOpacity(kind: MeeshyGlassButtonKind, drawsOwnResponse: Boolean, pressed: Boolean, hovered: Boolean): Float {
            if (!drawsOwnResponse || kind == MeeshyGlassButtonKind.Active || kind == MeeshyGlassButtonKind.Soft) return 0f
            return when {
                pressed -> PRESS_VEIL_PRESSED_OPACITY
                hovered -> PRESS_VEIL_HOVERED_OPACITY
                else -> 0f
            }
        }

        private fun ink(kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone, glyphTint: Color?): MeeshyGlassButtonInk = when (kind) {
            MeeshyGlassButtonKind.Active ->
                if (tone == MeeshyGlassTone.Theme) MeeshyGlassButtonInk.ThemeInverse else MeeshyGlassButtonInk.OnSolid
            MeeshyGlassButtonKind.Destructive -> MeeshyGlassButtonInk.OnMedia
            MeeshyGlassButtonKind.Normal, MeeshyGlassButtonKind.Soft -> when {
                glyphTint != null -> MeeshyGlassButtonInk.Custom(glyphTint)
                tone == MeeshyGlassTone.Theme -> MeeshyGlassButtonInk.ThemeInk
                else -> MeeshyGlassButtonInk.OnMedia
            }
        }
    }
}

// region Jetons

/** La couleur du fond plein, avant son opacité. [themeInk] : l'encre du thème, pour l'actif sous le ton `Theme`. */
public fun MeeshyGlassButtonRecipe.fillColor(themeInk: Color): Color = when (fill) {
    MeeshyGlassButtonFill.Clear -> Color.Transparent
    MeeshyGlassButtonFill.White, MeeshyGlassButtonFill.Veil -> MeeshyMediaChromeColors.OnMedia
    MeeshyGlassButtonFill.Red -> MeeshyPalette.ErrorStrong
    MeeshyGlassButtonFill.ThemeInk -> themeInk
}

/** L'encre du glyphe. [themeInk] et [themeInverse] : l'encre du thème et son inverse, pour le ton `Theme`. */
public fun MeeshyGlassButtonRecipe.inkColor(themeInk: Color, themeInverse: Color): Color = when (val value = ink) {
    MeeshyGlassButtonInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
    MeeshyGlassButtonInk.OnSolid -> MeeshyPalette.Indigo950
    MeeshyGlassButtonInk.ThemeInk -> themeInk
    MeeshyGlassButtonInk.ThemeInverse -> themeInverse
    is MeeshyGlassButtonInk.Custom -> value.color
}

/** La couleur de l'anneau du focus clavier. [themeInk] : l'encre du thème, pour le ton `Theme`. */
public fun MeeshyGlassButtonRecipe.focusRingColor(themeInk: Color): Color = when (focusRing) {
    MeeshyGlassButtonFocusRing.OnMedia -> MeeshyMediaChromeColors.OnMedia
    MeeshyGlassButtonFocusRing.MediaBackdrop -> MeeshyMediaChromeColors.MediaBackdrop
    MeeshyGlassButtonFocusRing.ThemeInk -> themeInk
}

/**
 * L'encre contre son fond plein à pleine opacité, quand le fond est plein. `null` pour le normal et le doux : leur
 * contraste est celui du ton de K01.
 */
public fun MeeshyGlassButtonRecipe.solidContrast(themeInk: Color, themeInverse: Color): Double? {
    if (fill != MeeshyGlassButtonFill.White && fill != MeeshyGlassButtonFill.Red && fill != MeeshyGlassButtonFill.ThemeInk) return null
    return CanvasChromeScheme.contrastRatio(
        inkColor(themeInk, themeInverse).luminance().toDouble(),
        fillColor(themeInk).luminance().toDouble(),
    )
}

// endregion

// region Ce que le lecteur d'écran entend

/**
 * L'état que le bouton expose au lecteur d'écran : une bascule dit « Activé » ou « Désactivé » ; une option sélectionnée
 * se dit « sélectionné » ; un bouton déplié change de nom chez l'hôte, sans état de plus.
 */
@Immutable
public data class MeeshyGlassButtonAccessibilityState(
    val isToggle: Boolean,
    val isSelected: Boolean,
    val toggleIsOn: Boolean?,
) {
    public companion object {
        public fun resolve(activation: MeeshyGlassButtonActivation): MeeshyGlassButtonAccessibilityState = when (activation) {
            is MeeshyGlassButtonActivation.None, is MeeshyGlassButtonActivation.Expanded ->
                MeeshyGlassButtonAccessibilityState(isToggle = false, isSelected = false, toggleIsOn = null)
            is MeeshyGlassButtonActivation.Toggle ->
                MeeshyGlassButtonAccessibilityState(isToggle = true, isSelected = false, toggleIsOn = activation.isOn)
            is MeeshyGlassButtonActivation.Selected ->
                MeeshyGlassButtonAccessibilityState(isToggle = false, isSelected = activation.isOn, toggleIsOn = null)
        }

        /** Le nom de l'action d'appui long : celui que l'hôte donne, sinon le nom du bouton. */
        public fun longPressActionName(longPressLabel: String?, label: String): String =
            if (longPressLabel.isNullOrEmpty()) label else longPressLabel

        /** La valeur dite : le mot de la bascule, puis ce que le contrôle porte déjà (« Activé, AirPods »). */
        public fun composeValue(toggleWord: String?, value: String?): String =
            listOfNotNull(toggleWord, value).filter { it.isNotEmpty() }.joinToString(", ")
    }
}

// endregion

// region Le doigt et l'activation

/**
 * Ce que l'hôte entend du doigt (`onPressChange`) : posé, levé, et levé si le bouton quitte l'écran doigt posé
 * (`isPressed == null`). Rien quand rien ne change. Une loi pure, testée sans écran.
 */
internal object MeeshyGlassPressReport {
    fun report(wasPressed: Boolean, isPressed: Boolean?): Boolean? {
        if (isPressed == null) return if (wasPressed) false else null
        return if (wasPressed == isPressed) null else isPressed
    }
}

/**
 * Ce qui se passe quand un bouton est activé : désactivé, rien ; sinon UN impact (sauf [MeeshyGlassButtonHaptic.None],
 * quand l'hôte joue le sien), puis l'action. Une loi pure, testée sans écran.
 */
internal object MeeshyGlassButtonTrigger {
    fun perform(
        isEnabled: Boolean,
        haptic: MeeshyGlassButtonHaptic,
        play: (MeeshyGlassButtonHaptic) -> Unit,
        action: () -> Unit,
    ): Boolean {
        if (!isEnabled) return false
        if (haptic != MeeshyGlassButtonHaptic.None) play(haptic)
        action()
        return true
    }
}

// endregion
