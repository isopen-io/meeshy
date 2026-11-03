package me.meeshy.sdk.net

import me.meeshy.sdk.model.media.MediaClientRole

/**
 * Le droit, pour un contributeur du client partagé, de monter aussi sur un client des médias (#14613). Son
 * constructeur est `internal` : seul ce module en émet — à l'épinglage des certificats et à la frontière de session —,
 * si bien qu'un contributeur venu d'un autre module qui reprendrait leur NOM n'en hérite pas les droits. Ce que chaque
 * rôle permet est la loi `MediaClientDerivation`.
 */
class MediaClientGrant internal constructor(val role: MediaClientRole)
