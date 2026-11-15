package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.pow
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La nature de ce que la capsule dit. **Elle ne colore rien** : elle règle l'haptique, la priorité de l'annonce et le rôle
 * (loi 13 : du verre seul). Miroir de `MeeshyStatusCapsuleKind` (iOS).
 */
public enum class MeeshyStatusCapsuleKind {
    Info,
    Success,
    Warning,
    Failure,
    ;

    /** Le retour du doigt à l'apparition : un `light` pour une information. */
    public val feedback: MeeshyStatusCapsuleFeedback
        get() = when (this) {
            Info -> MeeshyStatusCapsuleFeedback.Light
            Success -> MeeshyStatusCapsuleFeedback.Success
            Warning -> MeeshyStatusCapsuleFeedback.Warning
            Failure -> MeeshyStatusCapsuleFeedback.Error
        }

    /** Seul un échec coupe la parole en cours : région vivante assertive. */
    public val announcesUrgently: Boolean get() = this == Failure

    /** Le rôle que la planche écrit (`status`, ou `alert` pour un échec). */
    public val role: MeeshyStatusCapsuleRole get() = if (this == Failure) MeeshyStatusCapsuleRole.Alert else MeeshyStatusCapsuleRole.Status
}

/** Le retour haptique d'une nature, nommé comme le site unique de l'app (`MeeshyHaptics`). */
public enum class MeeshyStatusCapsuleFeedback { Light, Success, Warning, Error }

public enum class MeeshyStatusCapsuleRole { Status, Alert }

/** Le bord d'où elle entre et vers lequel elle se ferme au glisser. */
public enum class MeeshyStatusCapsuleEdge { Bottom, Top }

/** Ce que le lecteur d'écran lit d'une capsule visible, dans cet ordre : le texte, puis l'action, puis ✕. */
public enum class MeeshyStatusCapsulePart { Text, Action, Close }

/** L'haptique de l'hôte : [None] laisse l'app jouer le sien. */
public enum class MeeshyStatusCapsuleHostHaptic { Automatic, None }

/** Combien de temps elle reste : [Automatic] laisse la loi décider. */
public sealed interface MeeshyStatusCapsuleDuration {
    public data object Automatic : MeeshyStatusCapsuleDuration

    public data object Persistent : MeeshyStatusCapsuleDuration

    public data class Milliseconds(val value: Int) : MeeshyStatusCapsuleDuration
}

/**
 * L'unique action : un libellé, un glyphe optionnel, ce qui part au relâcher. Égale par les mots, jamais par la
 * fermeture : un hôte qui repose le même élément ne rejoue rien.
 */
@Immutable
public class MeeshyStatusCapsuleAction(
    public val label: String,
    public val icon: ImageVector? = null,
    public val onClick: () -> Unit,
) {
    override fun equals(other: Any?): Boolean =
        other is MeeshyStatusCapsuleAction && other.label == label && other.icon == icon

    override fun hashCode(): Int = 31 * label.hashCode() + (icon?.hashCode() ?: 0)
}

/**
 * Ce que l'hôte présente : l'[id] (opaque, stable pour un même refus) et les champs de la face. Égal par valeurs, jamais
 * par fermetures. [occurrence] dit qu'un même refus est redit (la borne heurtée de nouveau pendant la frappe) : l'élément
 * change, le minuteur de l'hôte repart, et le silence de 2 s par [id] tait l'haptique. La fermeture vit dans l'élément :
 * [onDismiss] active le glisser, Échap et l'action « Fermer », [closeLabel] dessine le ✕. Miroir de `MeeshyStatusCapsuleItem`.
 */
@Immutable
public class MeeshyStatusCapsuleItem(
    public val id: String,
    public val message: String,
    public val detail: String? = null,
    public val icon: ImageVector? = null,
    public val kind: MeeshyStatusCapsuleKind = MeeshyStatusCapsuleKind.Info,
    public val action: MeeshyStatusCapsuleAction? = null,
    public val closeLabel: String? = null,
    public val onDismiss: (() -> Unit)? = null,
    public val tone: MeeshyGlassTone? = null,
    public val tint: Color? = null,
    public val duration: MeeshyStatusCapsuleDuration = MeeshyStatusCapsuleDuration.Automatic,
    public val occurrence: Int = 0,
) {
    override fun equals(other: Any?): Boolean =
        other is MeeshyStatusCapsuleItem &&
            other.id == id && other.message == message && other.detail == detail && other.icon == icon &&
            other.kind == kind && other.action == action && other.closeLabel == closeLabel &&
            (other.onDismiss == null) == (onDismiss == null) && other.tone == tone && other.tint == tint &&
            other.duration == duration && other.occurrence == occurrence

    override fun hashCode(): Int = listOf(id, message, detail, icon, kind, action, closeLabel, onDismiss == null, tone, tint, duration, occurrence)
        .fold(1) { acc, part -> 31 * acc + (part?.hashCode() ?: 0) }
}

/**
 * **Combien de temps elle reste, et quand elle se tait** (K14) : une loi pure, la même sur les trois plateformes
 * (`docs/product/kit/K14-MeeshyStatusCapsule.vectors.json`). Miroir de `MeeshyStatusCapsuleTiming` (iOS).
 */
public object MeeshyStatusCapsuleTiming {
    public const val AUTOMATIC_MILLISECONDS: Int = 4000
    public const val SCREEN_READER_MILLISECONDS: Int = 6000
    public const val SILENCE_MILLISECONDS: Int = 2000

    /** Ce que l'hôte a dit en dernier : l'`id` et l'instant (millisecondes d'une horloge monotone). */
    public data class Spoken(val id: String, val atMillis: Long)

    /**
     * La durée visible, en millisecondes ; `null` ⇒ elle reste tant que l'hôte ne la retire pas. [Automatic][MeeshyStatusCapsuleDuration.Automatic] :
     * 4 s sans action, persistante avec une action ; sous lecteur d'écran, jamais moins de 6 s. Une durée imposée par
     * l'hôte l'emporte, relevée à 6 s sous lecteur d'écran.
     */
    public fun visibleMilliseconds(
        duration: MeeshyStatusCapsuleDuration,
        hasAction: Boolean,
        isScreenReaderOn: Boolean,
    ): Int? = when (duration) {
        MeeshyStatusCapsuleDuration.Persistent -> null
        MeeshyStatusCapsuleDuration.Automatic ->
            if (hasAction) null else if (isScreenReaderOn) SCREEN_READER_MILLISECONDS else AUTOMATIC_MILLISECONDS
        is MeeshyStatusCapsuleDuration.Milliseconds ->
            if (isScreenReaderOn) maxOf(duration.value, SCREEN_READER_MILLISECONDS) else duration.value
    }

    /**
     * Vrai sauf si le MÊME `id` a parlé il y a moins de 2 s : redit pendant la même frappe, la borne ne vibrerait qu'une
     * fois par caractère.
     */
    public fun speaks(id: String, atMillis: Long, last: Spoken?): Boolean {
        if (last == null || last.id != id) return true
        return atMillis - last.atMillis >= SILENCE_MILLISECONDS
    }
}

/**
 * **La recette de K14 en VALEURS** : toute mesure de la capsule vit ici, nulle part ailleurs. Un composable ne s'inspecte
 * pas, sa recette si. Miroir de `MeeshyStatusCapsuleRecipe` (iOS) ; les vecteurs la lisent.
 */
public object MeeshyStatusCapsuleRecipe {
    public val radius: Dp = MeeshyRadius.xlPlus
    public val maxWidth: Dp = 350.dp
    public val paddingVertical: Dp = MeeshySpacing.smPlus
    public val paddingHorizontal: Dp = MeeshySpacing.mdPlus
    public val gap: Dp = MeeshySpacing.smPlus
    public val iconSize: Dp = MeeshyIconSize.lg
    public val messageSize: TextUnit = MeeshyFontSize.subhead
    public val detailSize: TextUnit = MeeshyFontSize.small

    public val actionHeight: Dp = MeeshyControlSize.regular
    public val actionPaddingHorizontal: Dp = MeeshySpacing.lg
    public val actionGap: Dp = MeeshySpacing.xsPlus
    public val actionGlyphSize: Dp = MeeshyIconSize.sm
    public val actionSize: TextUnit = MeeshyFontSize.subhead

    /** La cible de l'action et de ✕ : 48 dp sur Android (le dessin reste à 36 et 28). */
    public val tapTarget: Dp = MeeshyControlSize.minTouchTarget

    /** Le ✕ se dessine en 28 et se touche en 48. */
    public val closeSize: Dp = MeeshyControlSize.small
    public val closeGlyphSize: Dp = MeeshyIconSize.xs

    /** L'écart à la barre de l'hôte et la marge latérale ; la place reste à l'hôte. */
    public val edgeGap: Dp = MeeshySpacing.mdPlus
    public val sideMargin: Dp = MeeshySpacing.xl

    public val slideOffset: Dp = 8.dp
    public const val REDUCED_FADE_MILLIS: Int = 150
    public val dismissThreshold: Dp = 24.dp

    /** Le doigt doit bouger de cette distance avant que le glisser commence. */
    public val dragStart: Dp = 8.dp

    public const val DETAIL_OPACITY: Float = 0.85f
    public const val ACTION_PRESSED_OPACITY: Float = 0.78f

    /** Au-delà de ce `fontScale`, le texte est en « grande police » : quatre lignes et l'action sous le texte. */
    public const val LARGE_TEXT_FONT_SCALE: Float = 1.5f

    public fun isLargeText(fontScale: Float): Boolean = fontScale >= LARGE_TEXT_FONT_SCALE

    public fun messageLines(fontScale: Float): Int = if (isLargeText(fontScale)) 4 else 2

    /** En grande police, l'action passe sous le texte, alignée à la fin. */
    public fun actionIsBelowText(fontScale: Float): Boolean = isLargeText(fontScale)

    /** Un message vide ne fait pas de capsule. */
    public fun isVisible(message: String): Boolean = message.isNotBlank()

    /** Un détail vide n'existe pas. */
    public fun visibleDetail(detail: String?): String? = detail?.takeIf { it.isNotBlank() }

    /** Le nom du texte pour le lecteur d'écran, et l'annonce : « message, détail ». */
    public fun spokenText(message: String, detail: String?): String =
        visibleDetail(detail)?.let { "$message, $it" } ?: message

    /** Le détail à 85 % sur le verre sombre ; en encre pleine sur `OnLight`, où 85 % ne tient pas 4,5:1. */
    public fun detailInkOpacity(tone: MeeshyGlassTone): Float = if (tone == MeeshyGlassTone.OnLight) 1f else DETAIL_OPACITY

    /** Sans action ni fermeture, elle ne prend aucun doigt : le toucher traverse jusqu'à la scène. */
    public fun takesTouches(hasAction: Boolean, hasDismiss: Boolean): Boolean = hasAction || hasDismiss

    /** L'ordre de lecture, quelle que soit la disposition : le texte, puis l'action, puis ✕. Plus petit = lu d'abord. */
    public fun readingOrder(part: MeeshyStatusCapsulePart): Int = when (part) {
        MeeshyStatusCapsulePart.Text -> 0
        MeeshyStatusCapsulePart.Action -> 1
        MeeshyStatusCapsulePart.Close -> 2
    }

    /** Où elle se tient sous le doigt : elle suit vers son bord seulement. */
    public fun dragOffset(translation: Float, edge: MeeshyStatusCapsuleEdge): Float = when (edge) {
        MeeshyStatusCapsuleEdge.Bottom -> maxOf(0f, translation)
        MeeshyStatusCapsuleEdge.Top -> minOf(0f, translation)
    }

    /** 24 dp vers son bord ferment ; en deçà, elle revient. */
    public fun shouldDismiss(translationDp: Float, edge: MeeshyStatusCapsuleEdge): Boolean =
        abs(dragOffset(translationDp, edge)) >= dismissThreshold.value

    // region Contraste

    /** Le contraste du message (blanc) sur le verre, au PIRE : sur blanc pur, sans flou. Calculé depuis la recette de K01. */
    public fun messageContrast(tone: MeeshyGlassTone): Double {
        if (tone == MeeshyGlassTone.Theme) return actionContrast()
        return contrast(inkGray = 1.0, backdropGray = worstBackdropGray(tone))
    }

    /** Le contraste du détail à son opacité de ton. */
    public fun detailContrast(tone: MeeshyGlassTone): Double {
        if (tone == MeeshyGlassTone.Theme) return actionContrast()
        val backdrop = worstBackdropGray(tone)
        val opacity = detailInkOpacity(tone).toDouble()
        return contrast(inkGray = opacity + (1 - opacity) * backdrop, backdropGray = backdrop)
    }

    /** L'encre de l'action (`Indigo950`) sur son fond blanc plein. */
    public fun actionContrast(): Double = contrastRatio(luminance(MeeshyPalette.Indigo950), 1.0)

    /** Le gris du verre posé sur du blanc pur : le remplissage de la recette dense, mêlé au blanc qui passe à travers. */
    private fun worstBackdropGray(tone: MeeshyGlassTone): Double {
        val glass = MeeshyGlassRecipe.resolve(
            tone = tone, density = MeeshyGlassDensity.Dense, isTinted = false, isInteractive = false, isPressed = false,
            material = MeeshyGlassMaterial.Drawn, reduceMotion = false,
        )
        val fillGray = if (glass.fill == MeeshyGlassFill.Light) 1.0 else 0.0
        return fillGray * glass.fillOpacity + (1 - glass.fillOpacity)
    }

    private fun contrast(inkGray: Double, backdropGray: Double): Double =
        contrastRatio(grayLuminance(inkGray), grayLuminance(backdropGray))

    private fun grayLuminance(value: Double): Double = channel(value)

    private fun luminance(color: Color): Double =
        0.2126 * channel(color.red.toDouble()) + 0.7152 * channel(color.green.toDouble()) + 0.0722 * channel(color.blue.toDouble())

    private fun channel(value: Double): Double =
        if (value <= LINEAR_THRESHOLD) value / LINEAR_DIVISOR else ((value + GAMMA_OFFSET) / GAMMA_DIVISOR).pow(GAMMA)

    private fun contrastRatio(first: Double, second: Double): Double {
        val lighter = maxOf(first, second)
        val darker = minOf(first, second)
        return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET)
    }

    private const val LINEAR_THRESHOLD = 0.03928
    private const val LINEAR_DIVISOR = 12.92
    private const val GAMMA_OFFSET = 0.055
    private const val GAMMA_DIVISOR = 1.055
    private const val GAMMA = 2.4
    private const val CONTRAST_OFFSET = 0.05

    // endregion
}
