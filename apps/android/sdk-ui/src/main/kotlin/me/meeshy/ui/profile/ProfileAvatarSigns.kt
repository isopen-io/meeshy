package me.meeshy.ui.profile

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Les signes que porte l'avatar d'un profil (miroir de `UserProfileSheet.profileAvatar` iOS) : anneau de story réel,
 * humeur, pastille de présence et décor — tous masqués quand la cible m'a bloqué, l'anneau seul quand je l'ai bloquée.
 * Présentateur pur : aucune décision de produit (d'où vient la présence, quelle story) n'y entre.
 */
@Immutable
public data class ProfileAvatarSigns(
    val accent: Color,
    val storyRing: StoryRingState,
    val moodEmoji: String?,
    val presenceDot: Color?,
    val showsDecor: Boolean,
    val isGrayedOut: Boolean,
) {
    public val isRingTappable: Boolean get() = storyRing != StoryRingState.None
    public val isMoodTappable: Boolean get() = moodEmoji != null

    public companion object {
        public fun of(
            storyRing: StoryRingState,
            moodEmoji: String?,
            presence: PresenceState?,
            isBlockedByMe: Boolean,
            isBlockedByTarget: Boolean,
            accent: Color = MeeshyPalette.Indigo500,
        ): ProfileAvatarSigns {
            if (isBlockedByTarget) {
                return ProfileAvatarSigns(
                    accent = MeeshyPalette.BlockedNeutral,
                    storyRing = StoryRingState.None,
                    moodEmoji = null,
                    presenceDot = null,
                    showsDecor = false,
                    isGrayedOut = true,
                )
            }
            return ProfileAvatarSigns(
                accent = accent,
                storyRing = if (isBlockedByMe) StoryRingState.None else storyRing,
                moodEmoji = moodEmoji?.takeIf { it.isNotEmpty() },
                presenceDot = meeshyPresenceDotColor(presence),
                showsDecor = true,
                isGrayedOut = false,
            )
        }
    }
}
