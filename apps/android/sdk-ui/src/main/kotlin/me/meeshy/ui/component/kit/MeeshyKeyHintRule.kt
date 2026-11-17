package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Une touche abstraite : l'hôte écrit `Primary`, jamais Commande ni Ctrl ; la loi choisit selon la machine. */
public sealed interface MeeshyKey {
    public data class Character(val value: String) : MeeshyKey

    public data object Primary : MeeshyKey
    public data object Shift : MeeshyKey
    public data object Option : MeeshyKey
    public data object Control : MeeshyKey
    public data object Enter : MeeshyKey
    public data object Escape : MeeshyKey
    public data object Space : MeeshyKey
    public data object Tab : MeeshyKey
    public data object Delete : MeeshyKey
    public data object Up : MeeshyKey
    public data object Down : MeeshyKey
    public data object Left : MeeshyKey
    public data object Right : MeeshyKey
}

public enum class MeeshyKeyPlatform { Apple, Other }

/** `Free` en flux, `Inset` dans un bouton, `Legend` posé par la légende. */
public enum class MeeshyKeyHintContext { Free, Inset, Legend }

public enum class MeeshyKeyHintSize { Regular, Compact }

/** La surface qui porte la touche : `Auto` lit celle de l'hôte, les autres se forcent hors du kit. */
public enum class MeeshyKeyHintSurface { Auto, OnFill, OnAccent, OnGlass }

/** Une entrée de légende : une ou plusieurs combinaisons pour UN libellé déjà traduit. */
@Immutable
public data class MeeshyKeyLegendItem(
    val id: String,
    val combos: List<List<MeeshyKey>>,
    val title: String,
    val startsGroup: Boolean = false,
)

/** La loi pure de la touche : le glyphe, la phrase dite, et la promesse « le raccourci marche ici, maintenant ». */
public object MeeshyKeyHintRule {

    public fun glyphs(keys: List<MeeshyKey>, platform: MeeshyKeyPlatform): List<String> = keys.map { glyph(it, platform) }

    /** « raccourci : Command M » : le préfixe vient de l'hôte (traduit), les noms de la loi (anglais par défaut). */
    public fun spoken(
        keys: List<MeeshyKey>,
        platform: MeeshyKeyPlatform,
        prefix: String,
        name: (MeeshyKey, MeeshyKeyPlatform) -> String = { key, platform -> defaultName(key, platform) },
    ): String = "$prefix : " + keys.joinToString(" ") { name(it, platform) }

    /** Une touche affichée est une promesse : clavier matériel présent ET commande active. */
    public fun isShown(hasKeyboard: Boolean, isEnabled: Boolean): Boolean = hasKeyboard && isEnabled

    /**
     * Un clavier à touches (`Configuration.KEYBOARD_QWERTY`) qui n'est pas replié (`HARDKEYBOARDHIDDEN_YES`). Une configuration
     * inconnue, un clavier absent ou un pavé numérique ne promettent aucun raccourci : une touche montrée sans clavier ment.
     */
    public fun hasHardwareKeyboard(keyboard: Int, hardKeyboardHidden: Int): Boolean =
        keyboard == KEYBOARD_QWERTY && hardKeyboardHidden != HARD_KEYBOARD_HIDDEN_YES

    private const val KEYBOARD_QWERTY: Int = 2
    private const val HARD_KEYBOARD_HIDDEN_YES: Int = 2

    public fun glyph(key: MeeshyKey, platform: MeeshyKeyPlatform): String {
        val apple = platform == MeeshyKeyPlatform.Apple
        return when (key) {
            is MeeshyKey.Character -> key.value.uppercase()
            MeeshyKey.Primary -> if (apple) "⌘" else "Ctrl"
            MeeshyKey.Shift -> if (apple) "⇧" else "Shift"
            MeeshyKey.Option -> if (apple) "⌥" else "Alt"
            MeeshyKey.Control -> if (apple) "⌃" else "Ctrl"
            MeeshyKey.Enter -> if (apple) "↩" else "Enter"
            MeeshyKey.Escape -> if (apple) "⎋" else "Esc"
            MeeshyKey.Space -> if (apple) "␣" else "Space"
            MeeshyKey.Tab -> if (apple) "⇥" else "Tab"
            MeeshyKey.Delete -> if (apple) "⌫" else "Del"
            MeeshyKey.Up -> "↑"
            MeeshyKey.Down -> "↓"
            MeeshyKey.Left -> "←"
            MeeshyKey.Right -> "→"
        }
    }

    public fun defaultName(key: MeeshyKey, platform: MeeshyKeyPlatform): String {
        val apple = platform == MeeshyKeyPlatform.Apple
        return when (key) {
            is MeeshyKey.Character -> key.value.uppercase()
            MeeshyKey.Primary -> if (apple) "Command" else "Control"
            MeeshyKey.Shift -> "Shift"
            MeeshyKey.Option -> if (apple) "Option" else "Alt"
            MeeshyKey.Control -> "Control"
            MeeshyKey.Enter -> "Enter"
            MeeshyKey.Escape -> "Escape"
            MeeshyKey.Space -> "Space"
            MeeshyKey.Tab -> "Tab"
            MeeshyKey.Delete -> "Delete"
            MeeshyKey.Up -> "Up"
            MeeshyKey.Down -> "Down"
            MeeshyKey.Left -> "Left"
            MeeshyKey.Right -> "Right"
        }
    }
}

@Immutable
public data class MeeshyKeyHintValues(
    val isRendered: Boolean,
    val keyCount: Int,
    val sizeDp: Int,
    val cornerRadiusDp: Int,
    val paddingDp: Int,
    val gapDp: Int,
    val textSp: Float,
    val pressedOffsetDp: Float,
    val usesAccent: Boolean,
)

public object MeeshyKeyHintRecipe {
    public const val PRESS_MILLIS: Int = 120
    public const val MAX_KEYS: Int = 3
    private const val PRESS_OFFSET_DP: Float = 1.5f

    @Suppress("LongParameterList")
    public fun resolve(
        keys: List<MeeshyKey>,
        context: MeeshyKeyHintContext,
        size: MeeshyKeyHintSize,
        hasKeyboard: Boolean,
        isPressed: Boolean,
        reduceMotion: Boolean,
        isEnabled: Boolean = true,
    ): MeeshyKeyHintValues {
        val compact = size == MeeshyKeyHintSize.Compact
        return MeeshyKeyHintValues(
            isRendered = keys.isNotEmpty() && MeeshyKeyHintRule.isShown(hasKeyboard, isEnabled),
            keyCount = keys.size.coerceAtMost(MAX_KEYS),
            sizeDp = if (compact) 20 else 26,
            cornerRadiusDp = 8,
            paddingDp = 6,
            gapDp = if (compact) 3 else 4,
            textSp = if (compact) 10.5f else 12.5f,
            pressedOffsetDp = if (isPressed && !reduceMotion) PRESS_OFFSET_DP else 0f,
            usesAccent = isPressed,
        )
    }
}

/** La légende : paires touche + libellé, filet entre deux groupes, barre de 44 qui demande son verre à K01. */
public object MeeshyKeyLegendRule {
    public const val PAIR_GAP_DP: Int = 6
    public const val GROUP_GAP_DP: Int = 10
    public const val BAR_HEIGHT_DP: Int = 44
    public const val BAR_RADIUS_DP: Int = 14

    /** Pour chaque paire : un filet avant elle ? Jamais avant la première. */
    public fun rulesBefore(items: List<MeeshyKeyLegendItem>): List<Boolean> =
        items.mapIndexed { index, item -> index > 0 && item.startsGroup }
}
