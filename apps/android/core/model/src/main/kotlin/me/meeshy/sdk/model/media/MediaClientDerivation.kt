package me.meeshy.sdk.model.media

/**
 * **Ce que le client HTTP des médias garde du client partagé** (#14567). Il en partage le pool de connexions (HTTP/2,
 * multiplexage) mais pas les intercepteurs d'API : un jeton, une garde d'URL ou une relance montés là feraient partir
 * l'identité du lecteur vers l'hôte qu'une `mediaURL` désigne. Seuls l'épinglage des certificats et la frontière de
 * session passent ; l'identité d'une requête média reste l'affaire de `MediaRequestCredential`, requête par requête.
 *
 * Liste BLANCHE : un contributeur que cette loi ne nomme pas — ajouté demain au client partagé, ou renommé — ne monte
 * pas sur le client des médias.
 */
public object MediaClientDerivation {
    public const val PINNING: String = "certificate-pinning"
    public const val SESSION_BOUNDARY: String = "session-boundary"

    private val KEPT: Set<String> = setOf(PINNING, SESSION_BOUNDARY)

    public fun kept(contributorIds: Collection<String>): List<String> = contributorIds.filter(KEPT::contains).distinct()
}
