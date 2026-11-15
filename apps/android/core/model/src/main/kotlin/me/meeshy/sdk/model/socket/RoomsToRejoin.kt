package me.meeshy.sdk.model.socket

/**
 * Les salles de conversation à (re)joindre à chaque connexion, dans l'ordre de la jonction (miroir de
 * `SocketConnectionRules.roomsToRejoin`, iOS) : la conversation ACTIVE d'abord (affichage le plus vite),
 * puis les autres fenêtres ouvertes triées (une reconnexion se rejoue à l'identique), puis le reste trié.
 * Seules les salles mémorisées ([joined]) sont rejouées ; aucune n'apparaît deux fois.
 */
object RoomsToRejoin {
    fun order(joined: Set<String>, active: String?, open: Set<String>): List<String> {
        val first = listOfNotNull(active?.takeIf { it in joined })
        val opened = open.filter { it != active && it in joined }.sorted()
        val rest = joined.filter { it != active && it !in open }.sorted()
        return first + opened + rest
    }
}
