package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing

// region Le vocabulaire de la rangée

/**
 * Ce que toucher une puce fait de la sélection. [Actions] : aucune puce n'est courante, chacune déclenche `onAction`.
 * Miroir de `MeeshyChipRowMode` (iOS).
 */
public enum class MeeshyChipRowMode {
    Single,
    SingleOrNone,
    Multiple,
    Actions,
}

/** Comment les puces se posent : sur une rangée qui défile, repliées sur plusieurs rangées, ou en se partageant la largeur. */
public enum class MeeshyChipRowLayout {
    Scroll,
    Wrap,
    Equal,
}

/** Ce que la rangée DIT au lecteur d'écran : un choix, ou des onglets. */
public enum class MeeshyChipRowSemantics {
    Choice,
    Tabs,
}

/** Sur quoi la rangée se pose : un média ou une feuille sombre (encre claire), ou le thème de l'application (encre du thème). */
public enum class MeeshyChipRowSurface {
    OnMedia,
    Theme,
}

/** Le retour haptique d'un changement effectif. [None] quand l'hôte joue le sien. */
public enum class MeeshyChipRowHaptic {
    Light,
    None,
}

/** Ce qui ferme une puce, après son titre. Il reste en fin de ligne en RTL. */
public enum class MeeshyChipTrailing {
    None,
    Chevron,
    Remove,
}

/** Une puce choisit ([Choice]), ou déclenche ([Action], [Menu]) : une puce d'action ou de menu n'entre jamais dans la sélection. */
public enum class MeeshyChipKind {
    Choice,
    Action,
    Menu,
}

/**
 * La taille de la capsule : les jetons `MeeshyControlSize`, `MeeshySpacing` et `MeeshyFontSize`. Sur Android la cible
 * tactile est de 48 dp ([MeeshyControlSize.minTouchTarget]) : Compose ne prend aucun toucher hors des bornes de la
 * mise en page, la cible tient donc DANS la rangée, capsule centrée.
 */
public enum class MeeshyChipRowSize(
    public val heightDp: Float,
    public val horizontalPaddingDp: Float,
    public val fontSizeSp: Float,
) {
    Regular(MeeshyControlSize.regular.value, MeeshySpacing.md.value, MeeshyFontSize.subhead.value),
    Compact(MeeshyControlSize.small.value, MeeshySpacing.smPlus.value, MeeshyFontSize.small.value),
    ;

    /** La hauteur de la cible : au moins 48 dp, jamais sous la capsule. */
    public val targetHeightDp: Float get() = maxOf(heightDp, MeeshyControlSize.minTouchTarget.value)

    /** Ce dont la cible déborde la capsule, en haut et en bas. */
    public val verticalSlackDp: Float get() = (targetHeightDp - heightDp) / 2f

    /**
     * L'écart entre deux capsules de rangées repliées : cible moins capsule (12 dp en régulier). Il est porté par la
     * marge de chaque cellule, l'écart de mise en page entre rangées est donc nul.
     */
    public val wrappedRowGapDp: Float get() = targetHeightDp - heightDp
}

// endregion

// region La puce (valeur)

/**
 * Une puce : une VALEUR, donc comparable. Aucune chaîne n'est fabriquée ici : l'hôte passe le titre, le nom et l'aide, déjà
 * traduits. Miroir de `MeeshyChip` (iOS).
 *
 * `@Immutable` : sans cette marque, une rangée recomposée recomposerait chaque puce à valeur égale.
 */
@Immutable
public data class MeeshyChip<T>(
    val id: T,
    val title: String,
    val icon: ImageVector? = null,
    val trailing: MeeshyChipTrailing = MeeshyChipTrailing.None,
    val kind: MeeshyChipKind = MeeshyChipKind.Choice,
    val tint: Color? = null,
    val isEnabled: Boolean = true,
    val accessibilityLabel: String? = null,
    val hint: String? = null,
) {
    /** Le nom lu : `accessibilityLabel ?: title`. Vide si la puce n'a ni l'un ni l'autre, ce que la rangée refuse. */
    public val name: String get() = if (!accessibilityLabel.isNullOrEmpty()) accessibilityLabel else title

    public val hasAccessibleName: Boolean get() = name.isNotEmpty()

    /** Un glyphe sans titre : il se dessine plus grand. */
    public val isGlyphOnly: Boolean get() = title.isEmpty() && icon != null
}

// endregion

// region La loi de sélection

/** Ce que devient un toucher : rien, une sélection nouvelle, ou une action. */
public sealed interface MeeshyChipRowResponse<out T> {
    public data object Ignored : MeeshyChipRowResponse<Nothing>

    public data class Changed<T>(val selection: Set<T>) : MeeshyChipRowResponse<T>

    public data object Action : MeeshyChipRowResponse<Nothing>
}

/**
 * **La loi du toucher** : pure, sans écran. K04 calcule `next` et ne garde rien, la sélection appartient à l'hôte. Miroir
 * de `MeeshyChipRowRule` (iOS), mêmes vecteurs de parité.
 */
public object MeeshyChipRowRule {
    public fun <T> response(
        selection: Set<T>,
        tapped: T,
        mode: MeeshyChipRowMode,
        kind: MeeshyChipKind = MeeshyChipKind.Choice,
    ): MeeshyChipRowResponse<T> {
        if (mode == MeeshyChipRowMode.Actions || kind != MeeshyChipKind.Choice) return MeeshyChipRowResponse.Action
        return when (mode) {
            MeeshyChipRowMode.Actions -> MeeshyChipRowResponse.Action
            MeeshyChipRowMode.Single ->
                if (selection == setOf(tapped)) MeeshyChipRowResponse.Ignored else MeeshyChipRowResponse.Changed(setOf(tapped))
            MeeshyChipRowMode.SingleOrNone ->
                MeeshyChipRowResponse.Changed(if (tapped in selection) emptySet() else setOf(tapped))
            MeeshyChipRowMode.Multiple ->
                MeeshyChipRowResponse.Changed(if (tapped in selection) selection - tapped else selection + tapped)
        }
    }

    /** La sélection suivante : celle d'aujourd'hui quand le toucher est ignoré ou qu'il déclenche une action. */
    public fun <T> next(
        selection: Set<T>,
        tapped: T,
        mode: MeeshyChipRowMode,
        kind: MeeshyChipKind = MeeshyChipKind.Choice,
    ): Set<T> = (response(selection, tapped, mode, kind) as? MeeshyChipRowResponse.Changed)?.selection ?: selection

    /**
     * La puce à montrer après un changement de sélection : celle qui vient d'entrer (la première, dans l'ordre de la
     * rangée), sinon la première courante. `null` si rien n'est courant.
     */
    public fun <T> revealTarget(order: List<T>, previous: Set<T>, current: Set<T>): T? =
        order.firstOrNull { it in current && it !in previous } ?: order.firstOrNull { it in current }
}

// endregion

// region L'activation

/**
 * Ce qui se passe quand une puce est touchée : désactivée, rien ; ignorée, rien (ni rappel ni haptique) ; sinon UN impact
 * (sauf [MeeshyChipRowHaptic.None]), puis le rappel. Une loi pure, testée sans écran.
 */
internal object MeeshyChipRowTrigger {
    fun <T> perform(
        response: MeeshyChipRowResponse<T>,
        tapped: T,
        isEnabled: Boolean,
        haptic: MeeshyChipRowHaptic,
        play: (MeeshyChipRowHaptic) -> Unit,
        onChange: (Set<T>, T) -> Unit,
        onAction: ((T) -> Unit)?,
    ): Boolean {
        if (!isEnabled) return false
        when (response) {
            is MeeshyChipRowResponse.Ignored -> return false
            is MeeshyChipRowResponse.Changed -> {
                if (haptic != MeeshyChipRowHaptic.None) play(haptic)
                onChange(response.selection, tapped)
            }
            is MeeshyChipRowResponse.Action -> {
                if (haptic != MeeshyChipRowHaptic.None) play(haptic)
                onAction?.invoke(tapped)
            }
        }
        return true
    }
}

// endregion

// region Ce que le lecteur d'écran entend

public enum class MeeshyChipRole {
    /** Choix simple : un bouton radio, sélectionné ou non. */
    Choice,

    /** Choix multiple : une case, cochée ou non. */
    Toggle,
    Tab,
    Button,

    /** Ouvre une liste. */
    Menu,
}

/** Le rôle et la valeur d'une puce selon le mode, la sémantique et le genre. Miroir de `MeeshyChipAccessibility` (iOS). */
@Immutable
public data class MeeshyChipAccessibility(val role: MeeshyChipRole, val isSelected: Boolean) {
    public companion object {
        public fun resolve(
            mode: MeeshyChipRowMode,
            semantics: MeeshyChipRowSemantics,
            kind: MeeshyChipKind,
            isSelected: Boolean,
        ): MeeshyChipAccessibility = when {
            kind == MeeshyChipKind.Menu -> MeeshyChipAccessibility(MeeshyChipRole.Menu, false)
            kind == MeeshyChipKind.Action || mode == MeeshyChipRowMode.Actions -> MeeshyChipAccessibility(MeeshyChipRole.Button, false)
            semantics == MeeshyChipRowSemantics.Tabs -> MeeshyChipAccessibility(MeeshyChipRole.Tab, isSelected)
            mode == MeeshyChipRowMode.Multiple -> MeeshyChipAccessibility(MeeshyChipRole.Toggle, isSelected)
            else -> MeeshyChipAccessibility(MeeshyChipRole.Choice, isSelected)
        }
    }
}

// endregion
