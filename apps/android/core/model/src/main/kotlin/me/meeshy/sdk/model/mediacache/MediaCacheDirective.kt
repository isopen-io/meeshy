package me.meeshy.sdk.model.mediacache

/**
 * Ce qu'un cache disque a le droit de faire d'une réponse média, lu sur `Cache-Control`.
 * Miroir de `MediaCacheDirective` (iOS) : `no-store` => aucun octet gardé (ni disque ni
 * mémoire) ; `no-cache` => revalidation à chaque usage, donc pas gardé par le cache disque.
 */
public enum class MediaCacheDirective {
    PERSIST,
    REVALIDATE_EACH_USE,
    NEVER_STORE,
    ;

    public val mayPersist: Boolean get() = this == PERSIST

    public companion object {
        public fun fromCacheControl(header: String?): MediaCacheDirective {
            val directives = header.orEmpty()
                .split(',')
                .map { it.substringBefore('=').trim().lowercase() }
                .toSet()
            return when {
                "no-store" in directives -> NEVER_STORE
                "no-cache" in directives -> REVALIDATE_EACH_USE
                else -> PERSIST
            }
        }

        /** 404 et 410 : le fichier n'existe plus pour personne, la copie locale doit partir. */
        public fun meansGone(statusCode: Int): Boolean = statusCode == 404 || statusCode == 410
    }
}
