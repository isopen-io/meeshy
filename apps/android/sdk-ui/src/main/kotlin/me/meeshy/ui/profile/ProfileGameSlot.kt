package me.meeshy.ui.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * L'emplacement OPAQUE du niveau / rang d'un membre posé sur sa bannière (miroir de `ProfileGameSection` iOS) :
 * le SDK ne sait rien du jeu. L'app fournit [rank] (coin bas, début) et [level] (coin bas, fin) — l'ordre est
 * [PROFILE_BANNER_GAME_ORDER] ; ils ne doivent pas être interactifs — le doigt les traverse, toucher la bannière
 * l'ouvre toujours en plein écran.
 */
public class ProfileGameSlot(
    public val level: @Composable (userId: String, displayName: String) -> Unit,
    public val rank: @Composable (userId: String, displayName: String) -> Unit,
)

/** Les deux pièces du jeu posées sur la bannière. */
public enum class ProfileGamePiece {
    RANK,
    LEVEL,
    ;

    /** La pièce posée à l'angle bas du DÉBUT : son seul coin arrondi est le coin haut de FIN, tourné vers l'avatar. */
    public val sitsAtStart: Boolean get() = PROFILE_BANNER_GAME_ORDER.first() == this
}

/**
 * Du DÉBUT à la FIN de la bannière : le rang en tête, puis le niveau (décision porteur du 2026-11-10, #17375, #19764 —
 * « on passe le rang en tête, c'est l'objet du jeu : devenir Légende »). Jumelle de `GameBannerBadgeView.groupOrder`
 * (iOS) et de l'ordre de `GameProfileBanner` (web).
 */
public val PROFILE_BANNER_GAME_ORDER: List<ProfileGamePiece> = listOf(ProfileGamePiece.RANK, ProfileGamePiece.LEVEL)

/** `null` : la bannière reste nue. */
public val LocalProfileGameSlot: ProvidableCompositionLocal<ProfileGameSlot?> = compositionLocalOf { null }

@Composable
internal fun BoxScope.ProfileGameBadges(userId: String?, displayName: String, slot: ProfileGameSlot?) {
    if (slot == null || userId.isNullOrEmpty()) return
    Box(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        ProfileGamePieces(slot, userId, displayName)
    }
}

/** Les deux pièces aux angles bas, dans l'ordre de [PROFILE_BANNER_GAME_ORDER] ; le seul site qui les place. */
@Composable
public fun BoxScope.ProfileGamePieces(slot: ProfileGameSlot, userId: String, displayName: String) {
    PROFILE_BANNER_GAME_ORDER.forEach { piece ->
        Box(Modifier.align(if (piece.sitsAtStart) Alignment.BottomStart else Alignment.BottomEnd)) {
            when (piece) {
                ProfileGamePiece.RANK -> slot.rank(userId, displayName)
                ProfileGamePiece.LEVEL -> slot.level(userId, displayName)
            }
        }
    }
}
