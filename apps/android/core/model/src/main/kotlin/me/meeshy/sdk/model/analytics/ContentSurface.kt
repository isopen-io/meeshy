package me.meeshy.sdk.model.analytics

/**
 * Les écrans où un contenu s'affiche : miroir de `CONTENT_SURFACES`
 * (`packages/shared/types/content-surfaces.ts`, le CONTRAT TS fait foi, pas le Swift).
 *
 * Facultatif sur le fil : une valeur inconnue se décode en absente ([fromWire] rend `null`).
 */
enum class ContentSurface(val wire: String) {
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
    DETAIL("detail"),
    STORY("story"),
    VISITOR("visitor"),
    SEARCH("search"),
    NOTIFICATIONS("notifications"),
    COMMENTS("comments"),
    LINK_PREVIEW("link_preview"),
    STATUS("status");

    companion object {
        private val byWire: Map<String, ContentSurface> = entries.associateBy { it.wire }

        fun fromWire(value: String?): ContentSurface? = value?.let(byWire::get)
    }
}
