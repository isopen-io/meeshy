package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import me.meeshy.ui.theme.MeeshyMotionRecipe

/** Les trois formes : la rangée, la tuile d'une grille, la mention en ligne (K37). */
public enum class MeeshyLockedRowForm { Row, Tile, Inline }

/** Le pas de l'ouverture : au repos, ou le moment où elle se joue. */
public enum class MeeshyLockedRowUnlockStep { Rest, Play }

/**
 * Le geste pour obtenir ce qui est fermé : « Demander », « Voir le pack ». L'envoi de la demande reste à l'hôte ;
 * [isPending] et [isDone] lui sont remis, jamais gardés.
 */
public data class MeeshyLockedRowAction(
    val title: String,
    val isPending: Boolean = false,
    val isDone: Boolean = false,
    val perform: () -> Unit,
)

@Immutable
public data class MeeshyLockedRowValues(
    val cornerRadiusDp: Float,
    val minimumHeightDp: Float,
    val showsThingGlyph: Boolean,
    val thingGlyphSizeDp: Float,
    val strokeWidthDp: Float,
    val dashDp: List<Float>,
    val lockSizeDp: Float,
    val actionHeightDp: Float,
    val showsLock: Boolean,
    val isDashed: Boolean,
    val showsAction: Boolean,
    val actionIsActive: Boolean,
    val isButton: Boolean,
    val pressedScale: Float,
    val unlockFadeMillis: Int,
    val animatesDash: Boolean,
)

/**
 * **La recette de K37 en VALEURS** : forme, pointillé, cadenas, geste, ouverture. La rangée ne reçoit que trois textes ;
 * aucune valeur, image ou compte protégé n'a de place dans cette recette. Miroir de `MeeshyLockedRowRecipe` (iOS).
 */
public object MeeshyLockedRowRecipe {
    private const val UNLOCK_FADE_MILLIS: Int = 280
    private const val PRESSED_SCALE: Float = 0.98f

    @Suppress("LongParameterList")
    public fun resolve(
        form: MeeshyLockedRowForm,
        hasAction: Boolean,
        isPending: Boolean,
        isDone: Boolean,
        isOpen: Boolean,
        isPressable: Boolean,
        isPressed: Boolean,
        isEnabled: Boolean,
        isUnlocking: Boolean,
        reduceMotion: Boolean,
    ): MeeshyLockedRowValues {
        val isButton = isPressable && isEnabled
        return MeeshyLockedRowValues(
            cornerRadiusDp = cornerRadius(form),
            minimumHeightDp = if (form == MeeshyLockedRowForm.Row) 58f else 0f,
            showsThingGlyph = form == MeeshyLockedRowForm.Tile,
            thingGlyphSizeDp = 28f,
            strokeWidthDp = 1.5f,
            dashDp = listOf(5f, 4.4f),
            lockSizeDp = if (form == MeeshyLockedRowForm.Inline) 16f else 22f,
            actionHeightDp = 44f,
            showsLock = !isOpen,
            isDashed = !isOpen,
            showsAction = hasAction && form != MeeshyLockedRowForm.Inline,
            actionIsActive = hasAction && !isPending && !isDone,
            isButton = isButton,
            pressedScale = if (isButton && isPressed) PRESSED_SCALE else 1f,
            unlockFadeMillis = if (reduceMotion) MeeshyMotionRecipe.REDUCED_FADE_MILLIS else UNLOCK_FADE_MILLIS,
            animatesDash = isUnlocking && !reduceMotion,
        )
    }

    private fun cornerRadius(form: MeeshyLockedRowForm): Float = when (form) {
        MeeshyLockedRowForm.Row -> 20f
        MeeshyLockedRowForm.Tile -> 24f
        MeeshyLockedRowForm.Inline -> 0f
    }

    /**
     * Ouverte quand l'hôte la dit ouverte, ou pendant l'ouverture qu'il a demandée une fois celle-ci jouée. L'ouverture
     * jouée ne survit pas à la demande : quand l'hôte ne dit plus ni l'un ni l'autre, la rangée se referme.
     */
    public fun shownOpen(isOpen: Boolean, isUnlocking: Boolean, hasPlayed: Boolean): Boolean = isOpen || (isUnlocking && hasPlayed)

    /** L'ouverture se joue UNE fois : un second rendu à valeur égale ne rejoue rien. */
    public fun unlockStep(isUnlocking: Boolean, hasPlayed: Boolean): MeeshyLockedRowUnlockStep =
        if (isUnlocking && !hasPlayed) MeeshyLockedRowUnlockStep.Play else MeeshyLockedRowUnlockStep.Rest
}

/** Les mots dits : l'état fermé est écrit et dit, jamais seulement atténué. L'hôte (le composable) passe les ressources. */
public class MeeshyLockedRowWords(private val locked: String, private val unlocked: String) {
    /** « Présence, verrouillé, dès Ami » ; ouvert : « Présence, déverrouillé ». */
    public fun spokenLabel(title: String, requirement: String, isOpen: Boolean): String =
        if (isOpen) "$title, $unlocked" else "$title, $locked, $requirement"
}
