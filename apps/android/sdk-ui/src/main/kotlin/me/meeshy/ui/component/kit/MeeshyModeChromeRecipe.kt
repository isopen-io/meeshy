package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

// region Les énumérés

/** La tenue d'une capsule de mode : du verre (Quitter, le centre) ou le plein blanc de la validation. Miroir de `MeeshyModeCapsuleKind` (iOS). */
public enum class MeeshyModeCapsuleKind {
    Glass,
    Solid,
}

/**
 * Ce que la capsule montre : son titre, son seul glyphe, ou les deux. Le NOM est toujours dit au lecteur d'écran.
 * Miroir de `MeeshyModeCapsuleDisplay` (iOS).
 */
public enum class MeeshyModeCapsuleDisplay {
    Title,
    Glyph,
    GlyphAndTitle,
}

/** Ce que l'hôte demande au cadre : le montrer, ou le ranger (on filme) : ni visible ni touchable. Miroir de `MeeshyModeChromePresence` (iOS). */
public enum class MeeshyModeChromePresence {
    Shown,
    Stowed,
    ;

    public val isStowed: Boolean get() = this == Stowed
}

// endregion

// region L'action

/**
 * **Une action de capsule de mode** : le titre (le nom dit, même en coche), le glyphe, ce qu'on en montre, et les états
 * que l'hôte pilote (désactivée : rien à valider ; occupée : le rendu court). Ce que l'action fait est à l'hôte ; le kit
 * ne sait que la déclencher, une fois, par le site unique de K02.
 *
 * `@Immutable` : l'hôte qui l'écrit en ligne ne recompose pas le cadre à valeurs égales (la fermeture est lue à jour,
 * jamais comparée). Miroir de `MeeshyModeAction` (iOS).
 */
@Immutable
public class MeeshyModeAction(
    public val title: String,
    public val onClick: () -> Unit,
    public val icon: ImageVector? = null,
    public val display: MeeshyModeCapsuleDisplay = MeeshyModeCapsuleDisplay.Title,
    public val hint: String? = null,
    public val enabled: Boolean = true,
    public val busy: Boolean = false,
    public val haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light,
) {
    init {
        require(title.isNotEmpty()) { "MeeshyModeAction : le nom est obligatoire et non vide, même en coche" }
    }

    /** Les VALEURS de l'action : ce que la comparaison lit, la fermeture hors comparaison. */
    internal val values: MeeshyModeActionValues
        get() = MeeshyModeActionValues(title, icon, display, hint, enabled, busy, haptic)
}

/** Les valeurs d'une action, comparables : la fermeture n'en fait pas partie. */
@Immutable
internal data class MeeshyModeActionValues(
    val title: String,
    val icon: ImageVector?,
    val display: MeeshyModeCapsuleDisplay,
    val hint: String?,
    val enabled: Boolean,
    val busy: Boolean,
    val haptic: MeeshyGlassButtonHaptic,
) {
    /** L'action ne part que d'une capsule disponible : ni désactivée, ni occupée. */
    val isActionable: Boolean get() = enabled && !busy
}

/**
 * Le chemin UNIQUE d'une action : le toucher, Échap, le retour matériel, l'échappement du lecteur d'écran et
 * Ctrl + Entrée. Un impact léger, puis l'action, par le site unique de K02 ; rien si désactivée ou occupée.
 */
internal fun MeeshyModeActionValues.perform(play: (MeeshyGlassButtonHaptic) -> Unit, action: () -> Unit): Boolean =
    MeeshyGlassButtonTrigger.perform(isEnabled = isActionable, haptic = haptic, play = play, action = action)

// endregion

// region Le mouvement

/** Le mouvement du cadre : translation verticale et opacité. Miroir de `MeeshyModeChromeMotion` (iOS). */
@Immutable
public data class MeeshyModeChromeMotion(
    val travelDp: Float,
    val enterMillis: Int,
    val exitMillis: Int,
) {
    public val isFadeOnly: Boolean get() = travelDp == 0f

    /** La durée vers une présence donnée. */
    public fun durationToward(presence: MeeshyModeChromePresence): Int = if (presence.isStowed) exitMillis else enterMillis
}

// endregion

/**
 * **Toutes les valeurs du cadre d'un mode plein écran** (K16), nulle part ailleurs : les mesures de la planche
 * (`modeHead`, `plaque`), les durées, les plafonds. Les jetons du design system y sont nommés ; ce qui n'a pas de jeton
 * (le plafond de la plaque, sa largeur large, l'échelle des libellés) vit ici. Les longueurs sont en dp. Miroir de
 * `MeeshyModeChromeRecipe` (iOS), mêmes vecteurs de parité (`docs/product/kit/K16-MeeshyModeChrome.vectors.json`).
 */
public object MeeshyModeChromeRecipe {

    // region Capsules

    public val capsuleHeight: Float = MeeshyControlSize.tapTarget.value
    public val capsuleMargin: Float = MeeshySpacing.lg.value
    public val glyphGap: Float = MeeshySpacing.xsPlus.value
    public val glyphSize: Float = MeeshyIconSize.lg.value
    public val checkSize: Float = MeeshyIconSize.xl.value

    /** Entre deux éléments de l'en-tête. */
    public val itemGap: Float = MeeshySpacing.sm.value

    /** Ce dont la cible tactile (48 dp) déborde la capsule visible (44), de chaque côté. */
    public val touchSlack: Float = (MeeshyControlSize.minTouchTarget.value - capsuleHeight) / 2f

    // endregion

    // region En-tête

    public val headerInset: Float = MeeshySpacing.mdPlus.value
    public val wideHeaderInset: Float = MeeshySpacing.xxl.value

    /** Les libellés réduits à 80 % avant de se tronquer. */
    public const val MINIMUM_LABEL_SCALE: Float = 0.8f

    // endregion

    // region Plaque

    public val plateEdge: Float = MeeshySpacing.md.value
    public val plateRadius: Float = MeeshyRadius.xxl.value
    public val plateHorizontalPadding: Float = MeeshySpacing.mdPlus.value
    public val plateVerticalPadding: Float = MeeshySpacing.md.value
    public val plateGap: Float = MeeshySpacing.md.value
    public val plateBottomGap: Float = MeeshySpacing.md.value
    public const val PLATE_MINIMUM_BOTTOM: Float = 28f
    public const val PLATE_CEILING_SHARE: Float = 0.42f
    public const val PLATE_FLOOR: Float = 160f

    /** La largeur de la plaque posée sous la scène d'un grand écran (I3). */
    public const val WIDE_PLATE_WIDTH: Float = 400f

    // endregion

    // region La roue d'une capsule occupée

    public const val SPINNER_STROKE: Float = 2f
    public const val SPINNER_SWEEP: Float = 270f
    public const val SPINNER_TURN_MILLIS: Int = 900

    // endregion

    // region Mouvement

    public const val TRAVEL: Float = 12f
    public const val ENTER_MILLIS: Int = 250
    public const val EXIT_MILLIS: Int = 200
    public const val FADE_MILLIS: Int = 150
    public const val CONTENT_FADE_MILLIS: Int = 150

    // endregion

    // region Lois pures

    /**
     * La largeur d'une capsule : ses marges, son glyphe, son titre (à l'échelle des libellés). Jamais sous la hauteur de
     * la capsule.
     */
    public fun capsuleWidth(
        textWidth: Float,
        hasGlyph: Boolean,
        display: MeeshyModeCapsuleDisplay,
        labelScale: Float = 1f,
    ): Float {
        val finite = if (textWidth.isFinite()) textWidth else 0f
        val text = maxOf(finite, 0f) * labelScale.coerceIn(MINIMUM_LABEL_SCALE, 1f)
        val inner = when (effectiveDisplay(display, hasGlyph)) {
            MeeshyModeCapsuleDisplay.Title -> text
            MeeshyModeCapsuleDisplay.Glyph -> checkSize
            MeeshyModeCapsuleDisplay.GlyphAndTitle -> glyphSize + glyphGap + text
        }
        return maxOf(capsuleHeight, 2 * capsuleMargin + inner)
    }

    /** Sans glyphe, un affichage qui le demande retombe sur le titre : jamais une capsule vide. */
    public fun effectiveDisplay(display: MeeshyModeCapsuleDisplay, hasGlyph: Boolean): MeeshyModeCapsuleDisplay =
        if (hasGlyph) display else MeeshyModeCapsuleDisplay.Title

    /**
     * Le mouvement d'entrée et de retrait : translation verticale et opacité ; sous « réduire les animations », un
     * fondu de 150 ms sans déplacement.
     */
    public fun motion(reduceMotion: Boolean): MeeshyModeChromeMotion = MeeshyModeChromeMotion(
        travelDp = if (reduceMotion) 0f else TRAVEL,
        enterMillis = if (reduceMotion) FADE_MILLIS else ENTER_MILLIS,
        exitMillis = if (reduceMotion) FADE_MILLIS else EXIT_MILLIS,
    )

    public fun headerInset(isWide: Boolean): Float = if (isWide) wideHeaderInset else headerInset

    // endregion
}

/**
 * **Ce qu'on voit d'une capsule à un instant**, en VALEURS : un composable ne s'inspecte pas, sa recette si. La capsule
 * pleine prend le fond, l'encre et l'ombre de l'actif de K02 ; la capsule de verre ne peint rien : sa matière est celle
 * de K01. Miroir de `MeeshyModeCapsuleStyle` (iOS).
 */
@Immutable
public data class MeeshyModeCapsuleStyle(
    val kind: MeeshyModeCapsuleKind,
    /** L'opacité du fond blanc (94 % au repos, 78 % pressée) ; nulle pour le verre. */
    val fillOpacity: Float,
    val shadow: MeeshyGlassButtonShadow?,
    val inkIsSolid: Boolean,
    /** Seulement l'opacité du désactivé : le voile d'appui du verre dessiné est celui de K01. */
    val opacity: Float,
    val respondsToTouch: Boolean,
) {
    public companion object {
        public fun resolve(
            kind: MeeshyModeCapsuleKind,
            isPressed: Boolean,
            isEnabled: Boolean,
            isBusy: Boolean,
        ): MeeshyModeCapsuleStyle {
            val actionable = isEnabled && !isBusy
            val pressed = isPressed && actionable
            if (kind != MeeshyModeCapsuleKind.Solid) {
                return MeeshyModeCapsuleStyle(
                    kind = kind,
                    fillOpacity = 0f,
                    shadow = null,
                    inkIsSolid = false,
                    opacity = if (isEnabled) 1f else MeeshyGlassButtonRecipe.DISABLED_OPACITY,
                    respondsToTouch = actionable,
                )
            }
            val active = MeeshyGlassButtonRecipe.resolve(
                kind = MeeshyGlassButtonKind.Active,
                size = MeeshyGlassButtonSize.S44,
                tone = MeeshyGlassTone.Deep,
                isPressed = pressed,
                isEnabled = isEnabled,
            )
            return MeeshyModeCapsuleStyle(
                kind = kind,
                fillOpacity = active.fillOpacity,
                shadow = active.shadow,
                inkIsSolid = active.ink == MeeshyGlassButtonInk.OnSolid,
                opacity = active.opacity,
                respondsToTouch = actionable,
            )
        }
    }
}
