package me.meeshy.ui.component.avatar

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.ui.component.StoryRingState

/** La graine d'un atelier ouvert depuis un contenu (iOS `ComposerSeedTarget`) : un post ou un média source. */
@Immutable
public data class ComposeSeedTarget(val postId: String? = null, val mediaId: String? = null)

/**
 * Les résolveurs de « chrome social » (humeur, anneau de story, ouvertures), miroir de
 * `SocialChromeEnvironment.swift` : fournis UNE fois à la racine, hérités par toutes les feuilles, et
 * `null` par défaut. L'absence DÉGRADE (pas d'humeur, pas d'anneau, geste indisponible) ; elle ne plante jamais.
 */
@Immutable
public class SocialChromeEnvironment(
    /** Emoji d'humeur d'un utilisateur, ou `null`. */
    public val moodEmoji: ((String) -> String?)? = null,
    /** État de l'anneau de story d'un utilisateur. */
    public val storyRing: ((String) -> StoryRingState)? = null,
    /** Handler du toucher de la pastille d'humeur (ouvre le spotlight) ; `null` = pastille inerte. */
    public val moodTap: ((String) -> (() -> Unit)?)? = null,
    /** Ouvre le lecteur de stories d'un utilisateur ; `null` = l'avatar ne route pas vers la story. */
    public val openStoryViewer: ((String) -> Unit)? = null,
    /** Publie une story depuis une graine ; `null` = l'entrée « publier » est absente. */
    public val publishStory: ((ComposeSeedTarget) -> Unit)? = null,
    /** Ouvre l'atelier sur une graine ; `null` = l'entrée « Composer » est absente. */
    public val openComposer: ((ComposeSeedTarget) -> Unit)? = null,
) {
    public fun moodFor(userId: String?): String? = userId?.let { moodEmoji?.invoke(it) }?.takeIf { it.isNotEmpty() }

    public fun ringFor(userId: String?): StoryRingState =
        userId?.let { storyRing?.invoke(it) } ?: StoryRingState.None

    public fun moodTapFor(userId: String?): (() -> Unit)? = userId?.let { moodTap?.invoke(it) }

    public fun storyOpenerFor(userId: String?): (() -> Unit)? {
        val open = openStoryViewer ?: return null
        val id = userId ?: return null
        return { open(id) }
    }

    public companion object {
        /** Aucun résolveur posé. */
        public val Absent: SocialChromeEnvironment = SocialChromeEnvironment()
    }
}

/** Le chrome social de l'arbre ; [SocialChromeEnvironment.Absent] hors hiérarchie applicative (previews, tests). */
public val LocalSocialChrome: ProvidableCompositionLocal<SocialChromeEnvironment> = staticCompositionLocalOf { SocialChromeEnvironment.Absent }
