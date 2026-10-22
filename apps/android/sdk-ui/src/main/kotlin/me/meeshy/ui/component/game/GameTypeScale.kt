package me.meeshy.ui.component.game

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.game.GameTypeScaleLaw

/**
 * Le facteur à appliquer aux chiffres posés DANS un objet dessiné (le numéro d'une Meesh, le niveau d'un
 * anneau). Un objet de taille fixe ne grandit pas avec le texte, mais son chiffre doit rester lisible : le
 * facteur suit la taille de police système, borné à 1,3 pour ne pas sortir de la pièce.
 */
public class GameTypeScale(private val fontScale: Float) {
    public val factor: Float get() = GameTypeScaleLaw.factor(fontScale)

    /** [base] sp mis à l'échelle bornée. */
    public fun sp(base: Float): TextUnit = (base * factor).sp
}

@Composable
public fun rememberGameTypeScale(): GameTypeScale {
    val fontScale = LocalDensity.current.fontScale
    return remember(fontScale) { GameTypeScale(fontScale) }
}
