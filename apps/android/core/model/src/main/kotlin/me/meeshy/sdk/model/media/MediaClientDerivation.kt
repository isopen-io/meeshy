package me.meeshy.sdk.model.media

/** Le rôle qu'un contributeur du client partagé peut tenir sur le client des médias (#14567, #14613). */
public enum class MediaClientRole { CERTIFICATE_PINNING, SESSION_BOUNDARY }

/**
 * **Ce que le client HTTP des médias garde du client partagé** (#14567). Il en partage le pool de connexions (HTTP/2,
 * multiplexage) mais pas les intercepteurs d'API : un jeton, une garde d'URL ou une relance montés là feraient partir
 * l'identité du lecteur vers l'hôte qu'une `mediaURL` désigne. Seuls l'épinglage des certificats et la frontière de
 * session passent ; l'identité d'une requête média reste l'affaire de `MediaRequestCredential`, à chaque saut.
 *
 * Liste BLANCHE de RÔLES (#14613) : un contributeur sans rôle — ajouté demain au client partagé — ne monte pas sur le
 * client des médias. Le rôle n'est pas un nom qu'un contributeur choisit : il voyage dans un jeton que seul le module
 * réseau émet, si bien qu'un contributeur qui reprendrait le nom « certificate-pinning » n'en hérite pas les droits.
 */
public object MediaClientDerivation {
    private val KEPT: Set<MediaClientRole> = setOf(MediaClientRole.CERTIFICATE_PINNING, MediaClientRole.SESSION_BOUNDARY)

    public fun keeps(role: MediaClientRole?): Boolean = role != null && role in KEPT
}
