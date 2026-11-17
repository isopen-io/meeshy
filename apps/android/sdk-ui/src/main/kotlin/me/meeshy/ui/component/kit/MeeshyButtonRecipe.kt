package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.max

/** Les sept genres du bouton libellé (K40). Un seul `primary` ou `accent` par groupe ; `glass` remet la matière à K01. */
public enum class MeeshyButtonKind { Primary, Accent, Tinted, Glass, Outline, Danger, Text }

/** Quatre hauteurs : 56 pied de feuille, 50 défaut, 44 rangée ou billet, 36 bannière (cible étendue à 44). */
public enum class MeeshyButtonSize(public val heightDp: Int) { S56(56), S50(50), S44(44), S36(36) }

public enum class MeeshyButtonShape { Capsule, Round, Hold }

public enum class MeeshyButtonWidth { Fit, Fill }

/** L'état d'un `hold`, remis par l'hôte : le bouton ne connaît ni micro ni réseau. */
public enum class MeeshyButtonHoldState { Idle, Held, Live, Refused }

/** La matière d'un genre, sans couleur : la vue la peint avec les jetons du thème. */
public enum class MeeshyButtonFill { Solid, Soft, Surface, Outline, None }

/** L'encre d'un genre : l'encre de contraste du fond plein, la teinte, le rouge ou le neutre. */
public enum class MeeshyButtonInk { OnSolid, Tint, Error, Neutral }

@Immutable
public data class MeeshyButtonValues(
    val kind: MeeshyButtonKind,
    val fill: MeeshyButtonFill,
    val ink: MeeshyButtonInk,
    val softAlpha: Float,
    val heightDp: Int,
    val widthDp: Int?,
    val hitDp: Int,
    val cornerRadiusDp: Int,
    val titleSp: Float,
    val titleWeight: Int,
    val horizontalPaddingDp: Int,
    val endPaddingDp: Int,
    val glyphDp: Int,
    val showsTitle: Boolean,
    val scale: Float,
    val contentOpacity: Float,
    val showsIndicator: Boolean,
    val firesAction: Boolean,
    val playsHaptic: Boolean,
    val focusRingDp: Int,
    val focusRingGapDp: Int,
)

public object MeeshyButtonRecipe {
    public const val GAP_DP: Int = 8
    public const val PRESSED_SCALE: Float = 0.94f
    public const val DISABLED_OPACITY: Float = 0.45f
    public const val DANGER_ALPHA: Float = 0.13f
    public const val TINTED_ALPHA: Float = 0.18f
    public const val OUTLINE_DP: Float = 1.5f
    public const val TRAILING_PADDING_CUT_DP: Int = 6
    private const val MIN_TARGET_DP: Int = 44
    private const val ROUND_DP: Int = 56
    private const val HOLD_DP: Int = 96
    private const val ROUND_RADIUS_DP: Int = 18
    private const val FOCUS_RING_DP: Int = 2
    private const val FOCUS_RING_GAP_DP: Int = 3

    /** `round` et `hold` n'acceptent que `primary`, `accent` et `tinted` : tout autre genre y devient `primary`. */
    public fun effectiveKind(kind: MeeshyButtonKind, shape: MeeshyButtonShape): MeeshyButtonKind =
        if (shape == MeeshyButtonShape.Capsule) {
            kind
        } else {
            kind.takeIf { it == MeeshyButtonKind.Primary || it == MeeshyButtonKind.Accent || it == MeeshyButtonKind.Tinted }
                ?: MeeshyButtonKind.Primary
        }

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyButtonKind,
        size: MeeshyButtonSize,
        shape: MeeshyButtonShape,
        isPressed: Boolean,
        isFocused: Boolean,
        isEnabled: Boolean,
        isPending: Boolean,
        isDestructive: Boolean,
        hasTrailing: Boolean,
        hasTint: Boolean,
    ): MeeshyButtonValues {
        val genre = effectiveKind(kind, shape)
        val height = when (shape) {
            MeeshyButtonShape.Capsule -> size.heightDp
            MeeshyButtonShape.Round -> ROUND_DP
            MeeshyButtonShape.Hold -> HOLD_DP
        }
        val padding = horizontalPaddingDp(size)
        return MeeshyButtonValues(
            kind = genre,
            fill = fill(genre),
            ink = ink(genre, isDestructive, hasTint),
            softAlpha = if (genre == MeeshyButtonKind.Danger) DANGER_ALPHA else TINTED_ALPHA,
            heightDp = height,
            widthDp = if (shape == MeeshyButtonShape.Capsule) null else height,
            hitDp = max(height, MIN_TARGET_DP),
            cornerRadiusDp = when (shape) {
                MeeshyButtonShape.Capsule -> height / 2
                MeeshyButtonShape.Round -> ROUND_RADIUS_DP
                MeeshyButtonShape.Hold -> height / 2
            },
            titleSp = titleSp(size),
            titleWeight = 700,
            horizontalPaddingDp = padding,
            endPaddingDp = if (hasTrailing) padding - TRAILING_PADDING_CUT_DP else padding,
            glyphDp = when (shape) {
                MeeshyButtonShape.Round -> 28
                MeeshyButtonShape.Hold -> 36
                MeeshyButtonShape.Capsule -> if (size == MeeshyButtonSize.S44 || size == MeeshyButtonSize.S36) 16 else 22
            },
            showsTitle = shape == MeeshyButtonShape.Capsule,
            scale = if (isPressed && isEnabled && !isPending) PRESSED_SCALE else 1f,
            contentOpacity = if (isEnabled) 1f else DISABLED_OPACITY,
            showsIndicator = isPending,
            firesAction = isEnabled && !isPending,
            playsHaptic = isEnabled && !isPending,
            focusRingDp = if (isFocused) FOCUS_RING_DP else 0,
            focusRingGapDp = if (isFocused) FOCUS_RING_GAP_DP else 0,
        )
    }

    /** Le nom dit : le libellé, puis la raison d'un bouton éteint, ou l'attente d'un bouton occupé. */
    public fun spokenName(
        title: String,
        disabledReason: String?,
        pendingLabel: String?,
        isPending: Boolean,
        isEnabled: Boolean = true,
    ): String {
        val suffix = when {
            isPending -> pendingLabel
            !isEnabled -> disabledReason
            else -> null
        }
        return if (suffix.isNullOrBlank()) title else "$title, $suffix"
    }

    private fun fill(kind: MeeshyButtonKind): MeeshyButtonFill = when (kind) {
        MeeshyButtonKind.Primary, MeeshyButtonKind.Accent -> MeeshyButtonFill.Solid
        MeeshyButtonKind.Tinted, MeeshyButtonKind.Danger -> MeeshyButtonFill.Soft
        MeeshyButtonKind.Glass -> MeeshyButtonFill.Surface
        MeeshyButtonKind.Outline -> MeeshyButtonFill.Outline
        MeeshyButtonKind.Text -> MeeshyButtonFill.None
    }

    private fun ink(kind: MeeshyButtonKind, isDestructive: Boolean, hasTint: Boolean): MeeshyButtonInk = when (kind) {
        MeeshyButtonKind.Primary, MeeshyButtonKind.Accent -> MeeshyButtonInk.OnSolid
        MeeshyButtonKind.Danger -> MeeshyButtonInk.Error
        MeeshyButtonKind.Tinted -> MeeshyButtonInk.Tint
        MeeshyButtonKind.Glass, MeeshyButtonKind.Outline -> MeeshyButtonInk.Neutral
        MeeshyButtonKind.Text -> when {
            isDestructive -> MeeshyButtonInk.Error
            hasTint -> MeeshyButtonInk.Tint
            else -> MeeshyButtonInk.Neutral
        }
    }

    private fun titleSp(size: MeeshyButtonSize): Float = when (size) {
        MeeshyButtonSize.S56 -> 16f
        MeeshyButtonSize.S50 -> 15f
        MeeshyButtonSize.S44 -> 13.5f
        MeeshyButtonSize.S36 -> 12.5f
    }

    private fun horizontalPaddingDp(size: MeeshyButtonSize): Int = when (size) {
        MeeshyButtonSize.S56 -> 26
        MeeshyButtonSize.S50 -> 22
        MeeshyButtonSize.S44 -> 16
        MeeshyButtonSize.S36 -> 12
    }
}

/** La paire : deux boutons sur une ligne, parts 1,6 et 1, même hauteur ; si les libellés ne tiennent pas, elle s'empile. */
public object MeeshyButtonPairRule {
    public const val PRIMARY_WEIGHT: Float = 1.6f
    public const val SECONDARY_WEIGHT: Float = 1f
    public const val GAP_DP: Int = MeeshyButtonRecipe.GAP_DP
    private const val STACK_FONT_SCALE: Float = 1.3f

    public fun stacks(fontScale: Float): Boolean = fontScale >= STACK_FONT_SCALE
}

/** Le maintien : ondes tant qu'il émet, anneau plein en mouvement réduit ; le bouton rapporte un maintien, rien d'autre. */
public object MeeshyButtonHoldRule {
    public const val solidRingDp: Int = 6

    public fun showsWaves(state: MeeshyButtonHoldState, reduceMotion: Boolean): Boolean =
        state == MeeshyButtonHoldState.Live && !reduceMotion

    public fun showsSolidRing(state: MeeshyButtonHoldState, reduceMotion: Boolean): Boolean =
        state == MeeshyButtonHoldState.Live && reduceMotion

    public fun isHeld(state: MeeshyButtonHoldState): Boolean =
        state == MeeshyButtonHoldState.Held || state == MeeshyButtonHoldState.Live
}

/**
 * La loi du maintien : chaque bord se rapporte une seule fois — `true` au doigt posé, `false` au doigt levé, `null` s'il ne
 * change rien. Le doigt, le lecteur d'écran et le départ du bouton passent par elle, jamais par l'état que l'hôte renvoie.
 * Miroir de `MeeshyButtonHoldLaw` (iOS).
 */
public class MeeshyButtonHoldLaw {
    public var isHeld: Boolean = false
        private set

    public fun press(): Boolean? {
        if (isHeld) return null
        isHeld = true
        return true
    }

    public fun release(): Boolean? {
        if (!isHeld) return null
        isHeld = false
        return false
    }

    /** Le doigt sort ou le bouton disparaît : même effet qu'un doigt levé. */
    public fun cancel(): Boolean? = release()

    /** L'action du lecteur d'écran : tient s'il est libre, relâche s'il tient. */
    public fun toggle(): Boolean = (if (isHeld) release() else press()) ?: isHeld
}
