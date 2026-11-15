package me.meeshy.sdk.model.analytics

/**
 * Le LISTING où le lecteur a tapé un contenu : miroir de `OPEN_ORIGINS`
 * (`packages/shared/types/content-reach.ts`). Valeur inconnue = absente.
 */
enum class OpenOrigin(val wire: String) {
    FEED("feed"),
    REELS("reels"),
    PROFILE("profile"),
    BOOKMARKS("bookmarks"),
    HASHTAG("hashtag"),
    COMMUNITY("community"),
    NEARBY("nearby"),
    SOUND("sound"),
    STORY_RAIL("story_rail"),
    MOOD_AVATAR("mood_avatar"),
    CITATION("citation"),
    SEARCH("search"),
    NOTIFICATIONS("notifications"),
    COMMENTS("comments"),
    LINK_PREVIEW("link_preview"),
    STATUS("status");

    companion object {
        private val byWire: Map<String, OpenOrigin> = entries.associateBy { it.wire }

        fun fromWire(value: String?): OpenOrigin? = value?.let(byWire::get)
    }
}
