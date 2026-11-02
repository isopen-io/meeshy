package me.meeshy.sdk.model.analytics

/**
 * D'où vient le flux qui a affiché un contenu : miroir de `IMPRESSION_SOURCES`
 * (`services/gateway/src/routes/social/eventsSchemas.ts`, la passerelle fait foi). Toute autre
 * valeur est refusée en 400 ; OÙ le contenu est apparu se dit par [ContentSurface].
 */
enum class ImpressionSource(val wire: String) {
    FEED("feed"),
    PROFILE("profile"),
    SEARCH("search"),
    SHARED_LINK("shared_link"),
    NOTIFICATION("notification"),
    DETAIL("detail"),
    STORY("story"),
    STATUS("status"),
}
