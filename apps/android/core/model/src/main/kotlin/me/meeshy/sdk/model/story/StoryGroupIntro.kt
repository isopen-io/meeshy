package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.MeeshyUser

/**
 * L'identité annoncée par l'interlude entre deux auteurs (iOS `StoryViewModel.StoryGroupIntro`) : ce que la story a
 * déjà servi (substitut), puis ce que le profil et le fil d'humeurs y ajoutent. [username] porte d'abord le NOM servi
 * avec la story ; le profil résolu l'écrase par le vrai pseudo, seul à pouvoir suivre l'arobase.
 */
data class StoryGroupIntro(
    val userId: String,
    val username: String,
    val displayName: String? = null,
    val bannerUrl: String? = null,
    val bannerThumbHash: String? = null,
    val moodEmoji: String? = null,
    val moodMessage: String? = null,
) {
    val title: String get() = displayName ?: username

    /** La ligne « @pseudo », seulement quand un nom d'affichage la distingue du titre. */
    val handle: String? get() = if (displayName != null) "@$username" else null

    /** Ni nom ni bannière : le profil reste à chercher (cache d'abord, réseau ensuite). */
    val needsProfile: Boolean get() = displayName == null && bannerUrl == null

    fun withProfile(user: MeeshyUser): StoryGroupIntro {
        val fullName = listOfNotNull(user.firstName, user.lastName)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(" ")
        return copy(
            username = user.username,
            displayName = user.displayName ?: fullName.takeIf(String::isNotEmpty),
            bannerUrl = user.banner,
            bannerThumbHash = user.bannerThumbHash,
        )
    }

    fun withMood(emoji: String, message: String?): StoryGroupIntro = copy(moodEmoji = emoji, moodMessage = message)

    /** Le résumé lu par TalkBack : nom, présence (amis seulement, déjà décidée par l'appelant), humeur. */
    fun summary(presenceLabel: String?): String =
        listOfNotNull(title, presenceLabel, moodMessage).joinToString(", ")

    companion object {
        /** Voile de lisibilité de haut en bas (iOS : 0,62 / 0,28 / 0,72). */
        val SCRIM_ALPHAS: List<Float> = listOf(0.62f, 0.28f, 0.72f)

        fun placeholder(userId: String, name: String): StoryGroupIntro = StoryGroupIntro(userId = userId, username = name)
    }
}
