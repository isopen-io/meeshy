package me.meeshy.sdk.model.media

/**
 * **Quelle pile HTTP lit un média réseau** (#14613).
 *
 * - [MEDIA_CLIENT] : le client des médias, installé au démarrage par l'app — épinglage, frontière de session, et une
 *   identité réévaluée à chaque saut d'une redirection.
 * - [BUILT_IN_UNSIGNED] : le client n'est pas installé (lecteur construit avant l'initialisation, autre processus). La
 *   pile intégrée de Media3 lit alors SANS identité — elle n'a ni épinglage ni frontière de session, et suivrait une
 *   redirection avec ses en-têtes —, et ce repli se [reported] au lieu de passer en silence.
 */
public enum class MediaNetworkStack(public val reported: Boolean) {
    MEDIA_CLIENT(reported = false),
    BUILT_IN_UNSIGNED(reported = true),
    ;

    public companion object {
        public fun of(mediaClientInstalled: Boolean): MediaNetworkStack =
            if (mediaClientInstalled) MEDIA_CLIENT else BUILT_IN_UNSIGNED
    }
}
