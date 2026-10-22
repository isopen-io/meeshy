package me.meeshy.sdk.model

/**
 * Le genre d'une publication — port de `PostType` (PostType.swift). L'ordre est celui
 * de l'iOS : POST, REEL, STORY, STATUS. Une valeur inconnue (genre ajouté côté serveur)
 * ne lève jamais : [fromWire] rend `null` et l'appelant garde la chaîne brute.
 */
public enum class PostType(public val wire: String) {
    POST("POST"),
    REEL("REEL"),
    STORY("STORY"),
    STATUS("STATUS"),
    ;

    public companion object {
        public fun fromWire(raw: String?): PostType? {
            val key = raw?.trim()?.uppercase().orEmpty()
            return entries.firstOrNull { it.wire == key }
        }
    }
}
